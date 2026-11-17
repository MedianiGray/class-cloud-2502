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
 * · 模型由 AI_BASE / AI_MODEL 决定（默认 glm-4-flash），请求里带的 model 一律被忽略
 * · 余额不足只会返回错误，不会静默转成付费模型
 * · 每来源每天 40 次、单条 400 字上限，防刷
 * · 只放行本站和本机，别的站拿去当免费接口会被 CORS + Origin 检查挡掉
 */
const SF_KEY_FALLBACK = ""; // 想直接写死就填 sk-…，留空则读环境变量 AI_KEY / SF_KEY

/* ── 免费额度池：多家厂商排队，谁还能用就用谁 ──────────────────────
 * 为什么要池子：单家免费额度总会用完（硅基流动余额耗尽 → 30001），
 * 一家挂了整站就哑。这里按顺序逐个试，某家返回 401/402/403/429
 * 就判定「这家的额度今天用完了」，拉黑一段时间，自动跳到下一家。
 *
 * 排在前面的先用（免费额度更耐用的放前面）：
 *   1. 硅基流动  SF_KEY   Qwen2.5-7B-Instruct   —— 有额度时优先，模型质量好
 *   2. 智谱 GLM  AI_KEY   glm-4-flash           —— 长期免费兜底，最稳
 *
 * 想加一家：在 AI_POOL 环境变量里写 JSON 数组，形如
 *   [{"name":"某某","base":"https://…/v1","model":"…","keys":["XX_KEY"]}]
 * 环境变量 AI_POOL 一旦存在就完全覆盖下面的默认池，不用改代码。
 *
 * 兼容旧配置：只设了 AI_BASE / AI_MODEL / AI_KEY 的老部署照样能跑，
 * 会被当成池子里唯一的一家。 */
const COOL_MS = 20 * 60 * 1000;   // 某家额度用完后，冷却 20 分钟再回来试
const poolState = new Map();      // name -> { until, why, fails }

function envPool() {
  const raw = (process.env.AI_POOL || "").trim();
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) {
        return arr.filter(function (p) {
          return p && p.base && p.model;
        }).map(function (p) {
          return {
            name: String(p.name || p.base),
            base: String(p.base).replace(/\/+$/, ""),
            model: String(p.model),
            keys: Array.isArray(p.keys) ? p.keys : (p.key ? ["AI_KEY"] : ["AI_KEY"])
          };
        });
      }
    } catch (e) {}
  }
  const list = [];
  list.push({ name: "硅基流动", base: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct", keys: ["SF_KEY", "SF_KEY_FALLBACK"] });
  list.push({ name: "智谱 GLM", base: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash", keys: ["AI_KEY"] });
  /* 老部署：只配了 AI_BASE/AI_MODEL，就把这一条顶到最前面 */
  if (process.env.AI_BASE || process.env.AI_MODEL) {
    list.unshift({
      name: "自定义",
      base: (process.env.AI_BASE || "https://open.bigmodel.cn/api/paas/v4").trim().replace(/\/+$/, ""),
      model: (process.env.AI_MODEL || "glm-4-flash").trim(),
      keys: ["AI_KEY", "SF_KEY"]
    });
  }
  return list;
}

function keyOf(p) {
  for (let i = 0; i < p.keys.length; i++) {
    const v = (process.env[p.keys[i]] || (p.keys[i] === "SF_KEY_FALLBACK" ? SF_KEY_FALLBACK : "") || "").trim();
    if (v) return v;
  }
  return "";
}

function coolDown(p, why) {
  const old = poolState.get(p.name) || { fails: 0 };
  poolState.set(p.name, { until: Date.now() + COOL_MS, why: why, fails: (old.fails || 0) + 1 });
}

/* 返回池子里还能用的一家（跳过冷却中的、没 key 的） */
function pickPool() {
  const all = envPool();
  const now = Date.now();
  const ready = [];
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (!keyOf(p)) continue;
    const st = poolState.get(p.name);
    if (st && st.until > now) continue;
    ready.push(p);
  }
  return { all: all, ready: ready };
}

function poolStatus() {
  const now = Date.now();
  return envPool().map(function (p) {
    const st = poolState.get(p.name) || {};
    return {
      name: p.name,
      model: p.model,
      hasKey: !!keyOf(p),
      usable: !!keyOf(p) && !(st.until > now),
      cooledUntil: st.until > now ? new Date(st.until).toISOString() : null,
      why: st.why || null,
      fails: st.fails || 0
    };
  });
}

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

  const picked = pickPool();
  if (!picked.all.some(keyOf)) {
    return out(500, { e: "服务器上没配任何模型 key，去云函数环境变量里加 AI_KEY 或 SF_KEY" }, cors);
  }
  if (!picked.ready.length) {
    const st = poolStatus();
    const why = st.map(function (x) { return x.name + "：" + (x.why || (x.hasKey ? "冷却中" : "没 key")); }).join("；");
    return out(503, { e: "所有免费额度暂时都不可用（" + why + "），冷却 20 分钟后会自动恢复。" }, cors);
  }

  const errs = [];
  for (let i = 0; i < picked.ready.length; i++) {
    const p = picked.ready[i];
    const key = keyOf(p);
    let r;
    try {
      r = await fetch(p.base + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + key },
        body: JSON.stringify({ model: p.model, temperature: 0.3, max_tokens: 240, messages: clean }),
        signal: AbortSignal.timeout(12000)
      });
    } catch (e) {
      errs.push(p.name + " 连不上");
      continue;                            // 超时/网络问题：不拉黑，直接换下一家
    }

    if (!r.ok) {
      let t = "";
      try { t = (await r.text()).slice(0, 120); } catch (e) {}
      /* 额度/权限类错误 → 这家这段时间别再用，冷却后自动回来 */
      if (r.status === 401 || r.status === 402 || r.status === 403 || r.status === 429) {
        const why = r.status === 402 || /insufficient|30001/i.test(t)
          ? "免费额度已用完"
          : (r.status === 429 ? "被限流" : "key 或模型不可用");
        coolDown(p, why);
      }
      errs.push(p.name + "(" + r.status + ")");
      continue;
    }

    let d = {};
    try { d = await r.json(); } catch (e) {}
    const c = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    if (!c) {
      /* 有的模型（推理型）在小 max_tokens 下会返回空 content，换下一家 */
      errs.push(p.name + " 空回复");
      continue;
    }
    return out(200, {
      d: String(c).trim().slice(0, 400),
      p: p.name                      // 告诉前端这句是谁答的，方便排查额度
    }, Object.assign({ "cache-control": "no-store" }, cors));
  }

  return out(502, {
    e: "免费额度池里的几家都没答上来：" + errs.join("；") + "。过 20 分钟会自动重试，或先用离线规则。"
  }, cors);
}

/* ── 换端代理 ── */
function allowed(u) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    /* 文件列表、分享访问、用户信息分别落在 drive.kdocs.cn / vas.kdocs.cn / account.kdocs.cn，
       只放行 www 主域会把数据接口全挡在 403，页面就永远只有一个空壳。 */
    return h === "kdocs.cn" || h === "www.kdocs.cn" || h.endsWith(".kdocs.cn");
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
  /* 只读自查：浏览器直接打开 /proxy/pool 就能看到每家额度还在不在、是不是被冷却了（不暴露 key） */
  if (p.indexOf("/pool") >= 0) {
    return out(200, { pool: poolStatus() }, Object.assign({ "cache-control": "no-store" }, cors));
  }
  return handleWps(event, origin, cors, baseUrl);
};
