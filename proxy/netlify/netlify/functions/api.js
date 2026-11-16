/**
 * 班级云库 · 一台服务器管两件事（Netlify Functions 版）
 *
 * 部署方式：把 proxy/netlify 这个文件夹整个拖到 app.netlify.com 的 Deploy manually
 * 部署完会得到一个地址：https://xxx.netlify.app/，函数在：
 *
 *   .../.netlify/functions/api?route=wps&u=<编码后的地址>&mode=phone|desktop   换端
 *   .../.netlify/functions/api?route=chat   POST {messages:[...]}              AI 代理
 *
 * ── key 放哪 ──────────────────────────────────────────────────
 * Netlify 站点设置 → Site configuration → Environment variables → 新建 SF_KEY，
 * 值填 sk-…。不放环境变量也行：下面 SF_KEY_FALLBACK 直接写死，
 * 但注意我这个仓库是公开的，写死就等于公开，所以优先用环境变量。
 *
 * ── 为什么不会花钱 ────────────────────────────────────────────
 * 模型写死 Qwen/Qwen2.5-7B-Instruct（硅基流动免费档），请求里的 model 一律忽略；
 * 每人每天 40 次；只放行本站与本机。
 */

const SF_KEY_FALLBACK = "";

const MODEL = "Qwen/Qwen2.5-7B-Instruct";
const SF_BASE = "https://api.siliconflow.cn/v1";

const HOSTS = ["www.kdocs.cn", "kdocs.cn"];
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
const hits = {};

function corsFor(origin) {
  const ok = ALLOWED_ORIGINS.indexOf(origin) >= 0;
  return {
    "access-control-allow-origin": ok ? origin : ALLOWED_ORIGINS[0],
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "vary": "origin"
  };
}
function todayKey(origin) {
  const d = new Date();
  return origin + "|" + d.getUTCFullYear() + "-" + (d.getUTCMonth() + 1) + "-" + d.getUTCDate();
}

/* ── AI 代理 ── */
async function handleChat(event, origin, cors) {
  if (ALLOWED_ORIGINS.indexOf(origin) < 0) {
    return { statusCode: 403, headers: cors, body: JSON.stringify({ e: "origin not allowed" }) };
  }
  const k = todayKey(origin);
  hits[k] = (hits[k] || 0) + 1;
  if (hits[k] > DAILY_LIMIT) {
    return {
      statusCode: 429, headers: cors,
      body: JSON.stringify({ e: "今天这台设备问得太多了，明天再来，或者先用离线规则。" })
    };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ e: "body 不是 JSON" }) };
  }

  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const clean = msgs.slice(-6).map(function (m) {
    return {
      role: m && m.role === "assistant" ? "assistant" : (m && m.role === "system" ? "system" : "user"),
      content: String((m && m.content) || "").slice(0, 400)
    };
  });
  if (!clean.length) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ e: "没有 messages" }) };
  }

  const key = (process.env.SF_KEY || SF_KEY_FALLBACK || "").trim();
  if (!key) {
    return {
      statusCode: 500, headers: cors,
      body: JSON.stringify({ e: "服务器上没配 key，去 Netlify 的 Environment variables 里加 SF_KEY" })
    };
  }

  let r;
  try {
    r = await fetch(SF_BASE + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + key },
      body: JSON.stringify({ model: MODEL, temperature: 0.3, max_tokens: 240, messages: clean })
    });
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ e: "连不上模型服务：" + e.message }) };
  }
  if (!r.ok) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ e: "模型返回 HTTP " + r.status }) };
  }

  let d = {};
  try { d = await r.json(); } catch (e) {}
  const c = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!c) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ e: "空回复" }) };
  }
  return {
    statusCode: 200,
    headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    body: JSON.stringify({ d: String(c).trim().slice(0, 400) })
  };
}

/* ── 换端代理 ── */
function allowed(u) {
  try { return HOSTS.indexOf(new URL(u).hostname) >= 0; } catch (e) { return false; }
}
function proxied(target, mode, base) {
  return base + "&u=" + encodeURIComponent(target) + "&mode=" + mode;
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
  const hook = "<script>(function(){var P=" + JSON.stringify(base) +
    ",M=" + JSON.stringify(mode) +
    ";function w(u){try{var s=String(u);if(/^https?:\\/\\/([^\\/]+\\.)?kdocs\\.cn\\//.test(s))return P+\"&u=\"+encodeURIComponent(s)+\"&mode=\"+M;}catch(e){}return u;}" +
    "var f=window.fetch;window.fetch=function(i,o){try{if(typeof i===\"string\")i=w(i);else if(i&&i.url)i=w(i.url);}catch(e){}return f.call(window,i,o);};" +
    "var x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var a=[].slice.call(arguments);a[1]=w(u);return x.apply(this,a);};" +
    "})();</script>";
  return html.replace(/<head([^>]*)>/i, "<head$1>" + hook);
}

async function handleWps(event, origin, cors) {
  const q = event.queryStringParameters || {};
  const target = q.u;
  const base = "https://" + (event.headers.host || "") +
    (event.path || "/.netlify/functions/api") + "?route=wps";
  if (!target) {
    return {
      statusCode: 200,
      headers: { ...cors, "content-type": "text/plain; charset=utf-8" },
      body: "班级云库换端代理已就绪。用法：/.netlify/functions/api?route=wps&u=<编码后的地址>&mode=phone|desktop"
    };
  }
  if (!allowed(target)) {
    return { statusCode: 403, headers: cors, body: "host not allowed" };
  }
  const mode = q.mode === "desktop" ? "desktop" : "phone";

  let res;
  try {
    res = await fetch(target, {
      method: event.httpMethod === "POST" ? "POST" : "GET",
      headers: {
        "user-agent": UA[mode],
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "cookie": event.headers.cookie || ""
      },
      body: event.httpMethod === "POST" ? (event.body || undefined) : undefined,
      redirect: "follow"
    });
  } catch (e) {
    return { statusCode: 502, headers: cors, body: "upstream error: " + e.message };
  }

  const ctype = res.headers.get("content-type") || "";
  if (ctype.indexOf("text/html") < 0) {
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: res.status,
      headers: { ...cors, "content-type": ctype || "application/octet-stream" },
      body: buf.toString("base64"),
      isBase64Encoded: true
    };
  }

  const html = await res.text();
  return {
    statusCode: 200,
    headers: { ...cors, "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30" },
    body: rewriteHtml(html, target, mode, base)
  };
}

exports.handler = async function (event, context) {
  const origin = event.headers.origin || "";
  const cors = corsFor(origin);
  const q = event.queryStringParameters || {};

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }
  if (q.route === "chat" || (event.path || "").indexOf("chat") >= 0) {
    return handleChat(event, origin, cors);
  }
  return handleWps(event, origin, cors);
};
