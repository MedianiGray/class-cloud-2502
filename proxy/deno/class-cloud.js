/**
 * 班级云库 · 一台服务器管两件事（Deno Deploy 版，免费、不要卡）
 *
 *   /wps?u=<编码后的 WPS 地址>&mode=phone|desktop    换端：电脑看手机版 / 手机看电脑版
 *   /chat  POST {messages:[{role,content}...]}        代理 AI：key 留在服务器，前端碰不到
 *
 * ── 为什么一台够用 ────────────────────────────────────────────
 * Deno Deploy 免费额度对班级规模来说绰绰有余，一个项目可以同时挂这两条路由。
 * 部署完只需要一个地址，index.html 里两个常量各填一次。
 *
 * ── 部署（约 2 分钟，全程点鼠标）─────────────────────────────
 * 1. dash.deno.com → 用 GitHub 登录
 * 2. New Playground → 把本文件全部内容粘进去
 * 3. 点 Deploy，记下 https://xxx.deno.dev
 * 4. 想更稳就把 key 放进环境变量（Project → Settings → Environment Variables 建 SF_KEY），
 *    不建也行，下面 SF_KEY_FALLBACK 那里直接写，代码存在你的 Deno 账号里，不在公开仓库
 * 5. 回 index.html：PROXY 填 https://xxx.deno.dev/wps，AI_PROXY 填 https://xxx.deno.dev/chat
 *
 * ── 这个 AI 代理为什么不会花钱 ────────────────────────────────
 * · 模型写死成 Qwen/Qwen2.5-7B-Instruct（硅基流动的免费模型），请求里带的 model 一律被忽略
 * · 没有余额调用失败会返回错误，不会静默变成付费
 * · 每人每天 40 次、单条 240 字上限，防刷
 * · 只放行本站和本机，别的站拿去当免费接口会被 CORS 和 Origin 检查挡掉
 */
const SF_KEY_FALLBACK = ""; // 想直接写死就填 sk-…，留空则读环境变量 SF_KEY

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
const hits = new Map();

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
async function handleChat(req, origin, cors) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ e: "method not allowed" }), {
      status: 405, headers: { "content-type": "application/json", ...cors }
    });
  }
  if (ALLOWED_ORIGINS.indexOf(origin) < 0) {
    return new Response(JSON.stringify({ e: "origin not allowed" }), {
      status: 403, headers: { "content-type": "application/json", ...cors }
    });
  }

  const k = todayKey(origin);
  const n = (hits.get(k) || 0) + 1;
  if (n > DAILY_LIMIT) {
    return new Response(JSON.stringify({ e: "今天这台设备问得太多了，明天再来，或者先用离线规则。" }), {
      status: 429, headers: { "content-type": "application/json", ...cors }
    });
  }
  hits.set(k, n);

  let body = {};
  try { body = await req.json(); } catch (e) {
    return new Response(JSON.stringify({ e: "body 不是 JSON" }), {
      status: 400, headers: { "content-type": "application/json", ...cors }
    });
  }

  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const clean = msgs.slice(-6).map(function (m) {
    return { role: m && m.role === "assistant" ? "assistant" : (m && m.role === "system" ? "system" : "user"), content: String((m && m.content) || "").slice(0, 400) };
  });
  if (!clean.length) {
    return new Response(JSON.stringify({ e: "没有 messages" }), {
      status: 400, headers: { "content-type": "application/json", ...cors }
    });
  }

  const key = (Deno.env.get("SF_KEY") || SF_KEY_FALLBACK || "").trim();
  if (!key) {
    return new Response(JSON.stringify({ e: "服务器上没配 key，管理员去 Deno 的环境变量里加 SF_KEY" }), {
      status: 500, headers: { "content-type": "application/json", ...cors }
    });
  }

  let r;
  try {
    r = await fetch(SF_BASE + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + key },
      body: JSON.stringify({ model: MODEL, temperature: 0.3, max_tokens: 240, messages: clean })
    });
  } catch (e) {
    return new Response(JSON.stringify({ e: "连不上模型服务：" + e.message }), {
      status: 502, headers: { "content-type": "application/json", ...cors }
    });
  }

  if (!r.ok) {
    return new Response(JSON.stringify({ e: "模型返回 HTTP " + r.status }), {
      status: 502, headers: { "content-type": "application/json", ...cors }
    });
  }

  let d = {};
  try { d = await r.json(); } catch (e) {}
  const c = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!c) {
    return new Response(JSON.stringify({ e: "空回复" }), {
      status: 502, headers: { "content-type": "application/json", ...cors }
    });
  }

  return new Response(JSON.stringify({ d: String(c).trim().slice(0, 400) }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors }
  });
}

/* ── 换端代理 ── */
function allowed(u) {
  try { return HOSTS.indexOf(new URL(u).hostname) >= 0; } catch (e) { return false; }
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
  const hook = "<script>(function(){var P=" + JSON.stringify(base) +
    ",M=" + JSON.stringify(mode) +
    ";function w(u){try{var s=String(u);if(/^https?:\\/\\/([^\\/]+\\.)?kdocs\\.cn\\//.test(s))return P+\"?u=\"+encodeURIComponent(s)+\"&mode=\"+M;}catch(e){}return u;}" +
    "var f=window.fetch;window.fetch=function(i,o){try{if(typeof i===\"string\")i=w(i);else if(i&&i.url)i=w(i.url);}catch(e){}return f.call(window,i,o);};" +
    "var x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var a=[].slice.call(arguments);a[1]=w(u);return x.apply(this,a);};" +
    "})();</script>";
  return html.replace(/<head([^>]*)>/i, "<head$1>" + hook);
}

async function handleWps(req, url, origin, cors) {
  const target = url.searchParams.get("u");
  if (!target) {
    return new Response("班级云库换端代理已就绪。用法：/wps?u=<编码后的地址>&mode=phone|desktop", {
      status: 200, headers: { "content-type": "text/plain; charset=utf-8", ...cors }
    });
  }
  if (!allowed(target)) {
    return new Response("host not allowed", { status: 403, headers: cors });
  }
  const mode = url.searchParams.get("mode") === "desktop" ? "desktop" : "phone";
  const base = url.origin + url.pathname;

  const headers = new Headers();
  headers.set("user-agent", UA[mode]);
  headers.set("accept-language", "zh-CN,zh;q=0.9,en;q=0.8");
  headers.set("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  let res;
  try {
    res = await fetch(target, {
      method: req.method,
      headers: headers,
      body: ["GET", "HEAD"].indexOf(req.method) >= 0 ? undefined : req.body,
      redirect: "follow"
    });
  } catch (e) {
    return new Response("upstream error: " + e.message, { status: 502, headers: cors });
  }

  const ctype = res.headers.get("content-type") || "";
  if (ctype.indexOf("text/html") < 0) {
    const out = new Headers(cors);
    if (ctype) out.set("content-type", ctype);
    return new Response(res.body, { status: res.status, headers: out });
  }

  const html = await res.text();
  return new Response(rewriteHtml(html, target, mode, base), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30", ...cors }
  });
}

Deno.serve(async function (req) {
  const url = new URL(req.url);
  const origin = req.headers.get("origin") || "";
  const cors = corsFor(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (url.pathname === "/chat") return handleChat(req, origin, cors);
  return handleWps(req, url, origin, cors);
});
