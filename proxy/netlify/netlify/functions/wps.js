/**
 * 班级云库 · WPS 换端代理（Netlify Functions 版）
 *
 * 跟 proxy/wps-proxy.js 是同一件事、同一套逻辑，只换了 Runtime：
 * Cloudflare 的 *.workers.dev 在国内被 DNS 污染（实测解析到 118.184.78.78，
 * TCP 443 直接超时），那条路走不通，所以给一份能在 Netlify 上跑的。
 *
 * ── 为什么必须服务端 ──────────────────────────────────────────
 * WPS 是在服务端按 UA 决定往壳页面里写哪套前端：
 *   手机 UA → 加载 mShareFolder.js（移动版）
 *   电脑 UA → 加载 ShareFolder.js（桌面版）
 * 同一个地址、两套 JS，UA 又是浏览器禁止脚本设置的请求头，所以页面里怎么改都没用，
 * 只能让服务器用另一副身份去取。
 *
 * ── 部署（用 GitHub 登录，约 2 分钟，免费额度 125k 次/月）────────
 * 1. netlify.com → Log in with GitHub
 * 2. Sites → Add new site → Deploy manually（不用连仓库）
 * 3. 把本文件放到拖入目录的 netlify/functions/wps.js
 * 4. 部署完地址是 https://<站点名>.netlify.app/.netlify/functions/wps
 * 5. 把那个地址填进 index.html 的 PROXY，再推送
 *
 * ── 用法 ──────────────────────────────────────────────────────
 * GET /.netlify/functions/wps?u=<encodeURIComponent(WPS地址)>&mode=phone|desktop
 *
 * ── 边界 ──────────────────────────────────────────────────────
 * · 只对公开分享链接有效，登录态相关的写操作别指望
 * · 只放行 kdocs.cn，不做通用开放代理
 * · 免费版函数 10 秒超时，WPS 首页一般 1-3 秒，够
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

exports.handler = async function (event) {
  const qs = event.queryStringParameters || {};
  const self = "https://" + (event.headers.host || "") + event.path;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const target = qs.u;
  if (!target) {
    return {
      statusCode: 200,
      headers: { "content-type": "text/plain; charset=utf-8", ...CORS },
      body: "班级云库 · WPS 代理已就绪。用法：?u=<编码后的 WPS 地址>&mode=phone|desktop"
    };
  }
  if (!allowed(target)) {
    return { statusCode: 403, headers: CORS, body: "host not allowed" };
  }

  const mode = qs.mode === "desktop" ? "desktop" : "phone";

  const headers = {
    "user-agent": UA[mode],
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };
  const cookie = event.headers.cookie;
  if (cookie) headers["cookie"] = cookie;

  let res;
  try {
    res = await fetch(target, {
      method: event.httpMethod,
      headers: headers,
      body: ["GET", "HEAD"].indexOf(event.httpMethod) >= 0 ? undefined : event.body,
      redirect: "follow"
    });
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: "upstream error: " + e.message };
  }

  const ctype = res.headers.get("content-type") || "";

  if (ctype.indexOf("text/html") < 0) {
    const out = { ...CORS };
    if (ctype) out["content-type"] = ctype;
    const buf = Buffer.from(await res.arrayBuffer());
    return { statusCode: res.status, headers: out, body: buf.toString("base64"), isBase64Encoded: true };
  }

  const html = await res.text();
  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30", ...CORS },
    body: rewriteHtml(html, target, mode, self)
  };
};
