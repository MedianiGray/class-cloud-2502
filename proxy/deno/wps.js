/**
 * 班级云库 · WPS 换端代理（Deno Deploy 版 · 最省事的一种）
 *
 * 一次部署同时解决两个方向：
 *   mode=phone   → 服务器用手机身份取，拿到移动版（电脑上也能看到手机版）
 *   mode=desktop → 服务器用电脑身份取，拿到桌面版（手机上也能看到电脑版）
 *
 * ── 三条路都试过了，为什么选 Deno ──────────────────────────────
 * Cloudflare Worker：*.workers.dev 在国内被污染（实测解析到 118.184.78.78，443 超时）
 * Netlify：能用，但要拖整个文件夹，步骤多
 * Deno Deploy：只要登录 → 粘这段 → 点 Deploy，不建仓库、不拖文件，最轻
 *
 * ── 部署（约 1 分钟，全程不用命令行）────────────────────────────
 * 1. 打开 dash.deno.com → 用 GitHub 登录
 * 2. 点 New Playground（或 New Project → Playground）
 * 3. 把本文件全部内容粘进编辑器，点 Deploy
 * 4. 记下地址（形如 https://xxx.deno.dev）
 * 5. 回 index.html，把 PROXY 填成那个地址，再推送
 *
 * ── 用法 ──────────────────────────────────────────────────────
 * GET /?u=<encodeURIComponent(WPS完整地址)>&mode=phone|desktop
 *
 * ── 边界 ──────────────────────────────────────────────────────
 * · 只对公开分享链接有效，登录态的写操作别指望
 * · 只放行 kdocs.cn，不做通用开放代理
 * · 手机上看电脑版：内容是对的，但桌面版按 1200px 排，小屏上字会很小，要两指放大 ——
 *   这是「能看到」，不是「好用」，实话实说
 */

const HOSTS = ["www.kdocs.cn", "kdocs.cn"];
const UA = {
  phone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,HEAD,OPTIONS"
};

function allowed(u) {
  try {
    return HOSTS.indexOf(new URL(u).hostname) >= 0;
  } catch (e) { return false; }
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

Deno.serve(async function (req) {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const target = url.searchParams.get("u");
  if (!target) {
    return new Response(
      "班级云库 · WPS 代理已就绪。用法：?u=<编码后的 WPS 地址>&mode=phone|desktop",
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8", ...CORS } }
    );
  }
  if (!allowed(target)) {
    return new Response("host not allowed", { status: 403, headers: CORS });
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
    return new Response("upstream error: " + e.message, { status: 502, headers: CORS });
  }

  const ctype = res.headers.get("content-type") || "";

  if (ctype.indexOf("text/html") < 0) {
    const out = new Headers(CORS);
    if (ctype) out.set("content-type", ctype);
    return new Response(res.body, { status: res.status, headers: out });
  }

  const html = await res.text();
  return new Response(rewriteHtml(html, target, mode, base), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=30",
      ...CORS
    }
  });
});
