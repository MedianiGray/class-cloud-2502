/**
 * 班级云库 · WPS 移动版 / 桌面版代理（Cloudflare Worker）
 *
 * 它解决的就是「网页内改不了 UA」这件事：UA 改不了，但可以让**服务器**替你改。
 * Worker 用指定 UA 去取 WPS 的页面，再把 HTML 转给页面里的 iframe ——
 * WPS 是服务端按 UA 分发两套壳（mShareFolder / ShareFolder），所以这样拿到的就是真移动版。
 *
 * ── 部署（约 1 分钟，免费额度够用）───────────────────────────────
 * 1. 打开 dash.cloudflare.com → Workers & Pages → Create → Worker
 * 2. 把本文件全部内容粘进编辑器，点 Deploy
 * 3. 记下分配的地址（形如 https://xxx.yyy.workers.dev）
 * 4. 回到 index.html，把 PROXY 常量填成那个地址，重新提交推送
 *
 * ── 用法 ────────────────────────────────────────────────────────
 * GET  /?u=<encodeURIComponent(WPS完整地址)>&mode=phone|desktop
 *      返回改写过的 HTML，iframe 里直接能看
 * GET  /?u=...&mode=...（其他请求方法、资源文件同样透传）
 *
 * ── 已知边界 ────────────────────────────────────────────────────
 * · 只对**公开分享链接**有效（匿名可读）。要登录才看得到的文档，Worker 没有你的账号态。
 * · 页面里的接口请求（/api/*）已在注入脚本里改道过来，但个别依赖登录态或个人空间的
 *   能力仍可能失效 —— 能看、能翻目录、能开预览，写操作别指望。
 * · 只放行 kdocs.cn，避免变成任何网站的开放代理。
 */

const HOSTS = ["www.kdocs.cn", "kdocs.cn"];
const UA = {
  phone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,HEAD,OPTIONS",
};

function allowed(u) {
  try {
    const h = new URL(u).hostname;
    return HOSTS.indexOf(h) >= 0;
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

  html = html.replace(/<head([^>]*)>/i, "<head$1>" + hook);
  return html;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
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
    const ct = request.headers.get("content-type");
    if (ct) headers.set("content-type", ct);
    const accept = request.headers.get("accept");
    if (accept && accept.indexOf("text/html") >= 0) headers.set("accept", accept);
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);

    let res;
    try {
      res = await fetch(target, {
        method: request.method,
        headers: headers,
        body: ["GET", "HEAD"].indexOf(request.method) >= 0 ? undefined : request.body,
        redirect: "follow",
      });
    } catch (e) {
      return new Response("upstream error: " + e.message, { status: 502, headers: CORS });
    }

    const ctype = res.headers.get("content-type") || "";

    if (ctype.indexOf("text/html") < 0) {
      const out = new Headers(CORS);
      if (ctype) out.set("content-type", ctype);
      const cl = res.headers.get("content-length");
      if (cl) out.set("content-length", cl);
      return new Response(res.body, { status: res.status, headers: out });
    }

    const html = await res.text();
    const out = new Headers(CORS);
    out.set("content-type", "text/html; charset=utf-8");
    out.set("cache-control", "public, max-age=30");
    return new Response(rewriteHtml(html, target, mode, base), { status: 200, headers: out });
  }
};
