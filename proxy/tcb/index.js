/**
 * 班级云库 · 一台服务器管两件事（腾讯云开发 / 云函数版）
 *
 *   /wps?u=<编码后的 WPS 地址>&mode=phone|desktop    换端：电脑看手机版 / 手机看电脑版
 *   /chat  POST {messages:[{role,content}...]}        代理 AI：key 留在服务器，前端碰不到
 *
 * ── 为什么选腾讯云开发 ──────────────────────────────────────
 * 2026-11-16 实测：Cloudflare workers.dev 被 DNS 污染、Deno Deploy 关闭新注册、
 * Netlify 新站默认带访问保护且控制台在国内加载不出来、vercel.app 域名解析失败。
 * 国内能通、有免费额度、不要信用卡的，只剩腾讯云开发这一条。
 *
 * ── 部署（要你本人操作，约 10 分钟）──────────────────────────
 * 1. 打开 https://console.cloud.tencent.com/tcb ，微信扫码登录，开通一个环境（免费额度够用）
 * 2. 环境 → 云函数 → 新建函数，名字填 classCloud，运行环境选 Node.js 18
 * 3. 把这个文件的内容整段粘进 index.js，保存并「上传部署」
 * 4. 云函数详情 → 函数配置 → 环境变量，加一条 SF_KEY = 你的 sk-… 密钥
 * 5. 云函数 → HTTP 访问服务 → 给 classCloud 配一个路径（如 /api），拿到完整地址
 *    形如 https://<环境ID>.ap-shanghai.tcb-api.tencentcloudapi.com/api
 * 6. 回 index.html：PROXY 填 .../api/wps，AI_PROXY 填 .../api/chat
 *
 * ── 这个 AI 代理为什么不会花钱 ──────────────────────────────
 * · 模型写死成 Qwen/Qwen2.5-7B-Instruct（硅基流动的免费模型），请求里带的 model 一律被忽略
 * · 余额不足只会返回错误，不会静默转成付费模型
 * · 每来源每天 40 次、单条 400 字上限，防刷
 * · 只放行本站和本机，别的站拿去当免费接口会被 CORS + Origin 检查挡掉
 */
const SF_KEY_FALLBACK = ""; // 想直接写死就填 sk-…，留空则读环境变量 SF_KEY

const MODEL = "Qwen/Qwen2.5-7B-Instruct";
const SF_BASE = "https://api.siliconflow.cn/v1";

const HOSTS = ["www.kdocs.cn", "kdocs.cn"];
const HTML_CACHE = new Map();   // 实例内存缓存：翻来翻去重复的页不必每次都撞 WPS
const HTML_TTL = 45000;         // 45 秒，别设太长，WPS 内容会变、也容易被判成爬虫
const UA = {
  phone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
};

const ALLOWED_ORIGINS = [
  "https://medianigray.github.io",
  "http://127.0.0.1:8766",
  "http://localhost:8766"
];

const DAILY_LIMIT = 40;
const hits = new Map();

function corsFor(origin) {
  const ok = ALLOWED_ORIGINS.indexOf(origin) >= 0;
  return {
    "access-control-allow-origin": ok ? origin : ALLOWED_ORIGINS[0],
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-credentials": "true",
    "vary": "origin"
  };
}

function todayKey(origin) {
  const d = new Date();
  return origin + "|" + d.getUTCFullYear() + "-" + (d.getUTCMonth() + 1) + "-" + d.getUTCDate();
}

function out(statusCode, body, extraHeaders) {
  const base = { "content-type": "application/json; charset=utf-8" };
  return {
    statusCode: statusCode,
    headers: Object.assign(base, extraHeaders || {}),
    body: typeof body === "string" ? body : JSON.stringify(body),
    isBase64Encoded: false
  };
}

/* ── AI 代理 ── */
async function handleChat(event, origin, cors) {
  if ((event.httpMethod || "GET").toUpperCase() !== "POST") {
    return out(405, { e: "method not allowed" }, cors);
  }
  if (ALLOWED_ORIGINS.indexOf(origin) < 0) {
    return out(403, { e: "origin not allowed" }, cors);
  }

  const k = todayKey(origin);
  const n = (hits.get(k) || 0) + 1;
  if (n > DAILY_LIMIT) {
    return out(429, { e: "今天这台设备问得太多了，明天再来，或者先用离线规则。" }, cors);
  }
  hits.set(k, n);

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return out(400, { e: "body 不是 JSON" }, cors);
  }

  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const clean = msgs.slice(-6).map(function (m) {
    return {
      role: m && m.role === "assistant" ? "assistant" : (m && m.role === "system" ? "system" : "user"),
      content: String((m && m.content) || "").slice(0, 400)
    };
  });
  if (!clean.length) {
    return out(400, { e: "没有 messages" }, cors);
  }

  const key = (process.env.SF_KEY || SF_KEY_FALLBACK || "").trim();
  if (!key) {
    return out(500, { e: "服务器上没配 key，去云函数的环境变量里加一条 SF_KEY" }, cors);
  }

  let r;
  try {
    r = await fetch(SF_BASE + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + key },
      body: JSON.stringify({ model: MODEL, temperature: 0.3, max_tokens: 240, messages: clean })
    });
  } catch (e) {
    return out(502, { e: "连不上模型服务：" + e.message }, cors);
  }

  if (!r.ok) {
    return out(502, { e: "模型返回 HTTP " + r.status }, cors);
  }

  let d = {};
  try {
    d = await r.json();
  } catch (e) {}
  const c = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!c) {
    return out(502, { e: "空回复" }, cors);
  }

  return out(200, { d: String(c).trim().slice(0, 400) }, Object.assign({ "cache-control": "no-store" }, cors));
}

/* ── 换端代理 ── */
function allowed(u) {
  try {
    return HOSTS.indexOf(new URL(u).hostname) >= 0;
  } catch (e) {
    return false;
  }
}

function proxied(target, mode, base) {
  return base + "?u=" + encodeURIComponent(target) + "&mode=" + mode;
}

function rewriteHtml(html, target, mode, base) {
  const origin = new URL(target).origin;
  const fix = function (u) {
    if (!u) return u;
    if (/^(data|blob|javascript|mailto|tel|#)/i.test(u)) return u;
    let abs = u;
    if (u.indexOf("//") === 0) abs = "https:" + u;
    else if (u.indexOf("/") === 0) abs = origin + u;
    else if (!/^https?:/i.test(u)) abs = origin + "/" + u;
    if (!allowed(abs)) return u;
    return proxied(abs, mode, base);
  };
  html = html.replace(/\s(src|href)="([^"]+)"/gi, function (m, k, v) {
    return " " + k + '="' + fix(v) + '"';
  });
  if (!/\shref="[^"]*"\s*$/.test(html.slice(0, 200))) {
    html = html.replace(/(<head[^>]*>)/i, '$1<base href="' + origin + '/">');
  }
  const hook =
    "<script>(function(){var P=" + JSON.stringify(base) +
    ",M=" + JSON.stringify(mode) +
    ",O=" + JSON.stringify(origin) +
    ";function w(u){try{var s=String(u);" +
    "if(!s||/^(data|blob|javascript|mailto|tel|about|#)/i.test(s))return u;" +
    "var a=s;" +
    "if(s.indexOf('//')===0)a='https:'+s;" +
    "else if(s.charAt(0)==='/')a=O+s;" +
    "else if(!/^(https?:)/i.test(s))a=O+'/'+s;" +
    "if(/^(https?:)\\/\\/([^\\/]+\\.)?kdocs\\.cn\\//i.test(a))return P+'?u='+encodeURIComponent(a)+'&mode='+M;" +
    "}catch(e){}return u;}" +
    "var f=window.fetch;window.fetch=function(i,o){try{if(typeof i==='string')i=w(i);else if(i&&i.url)i=w(i.url);}catch(e){}return f.call(window,i,o);};" +
    "var x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var a=[].slice.call(arguments);try{a[1]=w(u);}catch(e){}return x.apply(this,a);};" +
    "})();</script>";
  return html.replace(/<head([^>]*)>/i, "<head$1>" + hook);
}

async function handleWps(event, origin, cors, basePath) {
  const qs = event.queryStringParameters || {};
  const target = qs.u || qs.U;
  if (!target) {
    return {
      statusCode: 200,
      headers: Object.assign({ "content-type": "text/plain; charset=utf-8" }, cors),
      body: "班级云库换端代理已就绪。用法：/wps?u=<编码后的地址>&mode=phone|desktop",
      isBase64Encoded: false
    };
  }
  if (!allowed(target)) {
    return { statusCode: 403, headers: cors, body: "host not allowed", isBase64Encoded: false };
  }
  const mode = (qs.mode === "desktop") ? "desktop" : "phone";

  const headers = {
    "user-agent": UA[mode],
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    /* WPS 的业务接口会校验来源域名；不带 Referer 时分享页只给壳、不给目录数据 */
    "referer": "https://www.kdocs.cn/",
    "sec-fetch-site": "same-origin"
  };
  const evHeaders = event.headers || {};
  const cookie = evHeaders.cookie || evHeaders.Cookie;
  if (cookie) headers.cookie = cookie;

  // 同一个实例内缓存一会儿，翻来翻去重复的页不必每次都去撞 WPS（也降低被限流的概率）
  const ckey = mode + " " + target;
  const hit = HTML_CACHE.get(ckey);
  if (hit && Date.now() - hit.t < HTML_TTL) {
    return {
      statusCode: 200,
      headers: Object.assign({
        "content-type": "text/html; charset=utf-8",
        "content-disposition": "inline",
        "cache-control": "public, max-age=30",
        "x-proxy-cache": "hit"
      }, cors),
      body: hit.html,
      isBase64Encoded: false
    };
  }
  if (hit) HTML_CACHE.delete(ckey);

  let res;
  try {
    res = await fetch(target, {
      method: (event.httpMethod || "GET").toUpperCase(),
      headers: headers,
      redirect: "follow"
    });
  } catch (e) {
    return { statusCode: 502, headers: cors, body: "upstream error: " + e.message, isBase64Encoded: false };
  }

  const ctype = res.headers.get("content-type") || "";
  /* WPS 的匿名会话靠 Set-Cookie 维持；不透传回去，每个请求都会被当成新访客，
     移动版就会一直显示「用户未登录」，目录列表也就出不来。 */
  let setCookie = null;
  try { setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : null; } catch (e) { setCookie = null; }
  if (!setCookie || !setCookie.length) {
    const one = res.headers.get("set-cookie");
    if (one) setCookie = [one];
  }
  const withCookie = function (h) {
    if (setCookie && setCookie.length) {
      h["set-cookie"] = (setCookie.length === 1) ? setCookie[0] : setCookie;
    }
    return h;
  };

  if (ctype.indexOf("text/html") < 0) {
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: res.status,
      headers: withCookie(Object.assign({ "content-type": ctype || "application/octet-stream" }, cors)),
      body: buf.toString("base64"),
      isBase64Encoded: true
    };
  }

  const html = rewriteHtml(await res.text(), target, mode, basePath);
  if (HTML_CACHE.size > 60) HTML_CACHE.clear();
  HTML_CACHE.set(ckey, { t: Date.now(), html: html });
  return {
    statusCode: 200,
    headers: withCookie(Object.assign({
      "content-type": "text/html; charset=utf-8",
      "content-disposition": "inline",
      "cache-control": "public, max-age=30",
      "x-proxy-cache": "miss"
    }, cors)),
    body: html,
    isBase64Encoded: false
  };
}

exports.main = async function (event, context) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || "";
  const cors = corsFor(origin);

  if ((event.httpMethod || "").toUpperCase() === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "", isBase64Encoded: false };
  }

  const rawPath = event.path || "/";
  const p = rawPath.toLowerCase();
  // 云函数返回的重写地址必须是完整 URL，否则浏览器拿到的 base 是相对路径
  const host = (event.headers && (event.headers.host || event.headers.Host)) || "";
  // 访问服务挂载在 /proxy 下，事件里的 path 只剩函数内路径，重写时必须把挂载前缀补回去
  const mountPrefix = "/proxy";
  const baseUrl = (host ? "https://" + host + mountPrefix : "") + rawPath;

  if (p.indexOf("/chat") >= 0) return handleChat(event, origin, cors);
  return handleWps(event, origin, cors, baseUrl);
};
