/**
 * 班级云库 · WPS 换端代理（腾讯云开发 CloudBase 云函数版）
 *
 * 和 proxy/wps-proxy.js 是同一套逻辑，换成国内可达的运行时。
 * 原因很简单：Cloudflare 的 workers.dev 域名在国内被 DNS 污染，实测解析十几毫秒就回来、
 * 连接直接超时，代码没错也连不通。云开发的域名是 *.tcloudbaseapp.com，国内直连。
 *
 * ── 这条路线为什么不会产生费用 ────────────────────────────────────
 * 云开发给个人开发者一份长期有效的免费额度（按日/按月结算，够这类低流量代理用）。
 * 只要不开「按量付费的升级套餐」、不买独立域名、不配 CDN 加速，就不会进入计费。
 * 部署时**任何让你「充值」「绑定支付方式」「开通付费套餐」的按钮都不要点** ——
 * 那一步才是花钱的地方。真到了额度上限，它的表现是当天调用被限流，不是自动扣费。
 *
 * ── 部署（约 5 分钟，全程不需要付费）──────────────────────────────
 * 1. 打开 tcb.cloud.tencent.com（腾讯云开发控制台），用微信或 QQ 登录，按提示做实名
 * 2. 新建一个环境，套餐选「免费」那一档，记下环境 ID（形如 xxx-1a2b3c）
 * 3. 进「云函数」→ 新建函数，名字填 wps，运行时选 Node.js 18
 *    把本文件的全部内容粘进 index.js，点保存并部署
 * 4. 进「云函数 wps」→「HTTP 访问服务」→ 添加路径 /wps，指向这个函数
 * 5. 记下访问地址（形如 https://xxx-1a2b3c.tcloudbaseapp.com/wps）
 * 6. 回到 index.html，把 PROXY 常量填成那个地址，重新提交
 *
 * ── 用法 ──────────────────────────────────────────────────────────
 * GET  {你的地址}?u=<encodeURIComponent(WPS完整地址)>&mode=phone|desktop
 *      返回改写过的 HTML，iframe 里直接能看
 *
 * ── 边界（和 Worker 版一致，没变好也没变坏）─────────────────────────
 * · 只对公开分享链接有效。要登录才看的文档，代理没有你的账号态。
 * · 能看、能翻目录、能开预览；上传、编辑这类写操作别指望。
 * · 只放行 kdocs.cn，避免变成任意网站的开放代理。
 */

const https = require("https");
const { URL } = require("url");

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

  const hook = "<script>(function(){var P=" + JSON.stringify(base) +
    ",M=" + JSON.stringify(mode) +
    ";function w(u){try{var s=String(u);if(/^https?:\\/\\/([^\\/]+\\.)?kdocs\\.cn\\//.test(s))return P+\"?u=\"+encodeURIComponent(s)+\"&mode=\"+M;}catch(e){}return u;}" +
    "var f=window.fetch;window.fetch=function(i,o){try{if(typeof i===\"string\")i=w(i);else if(i&&i.url)i=w(i.url);}catch(e){}return f.call(window,i,o);};" +
    "var x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var a=[].slice.call(arguments);a[1]=w(u);return x.apply(this,a);};" +
    "})();</script>";

  return html.replace(/<head([^>]*)>/i, "<head$1>" + hook);
}

function pull(target, method, headers, body) {
  return new Promise(function (resolve, reject) {
    const u = new URL(target);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: method || "GET",
      headers: headers
    }, function (res) {
      const chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks) });
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, function () { req.destroy(new Error("upstream timeout")); });
    if (body && method !== "GET" && method !== "HEAD") req.write(body);
    req.end();
  });
}

function reply(statusCode, headers, body, isBase64) {
  return { statusCode: statusCode, headers: headers, body: body, isBase64Encoded: !!isBase64 };
}

exports.main = async function (event) {
  const method = (event.httpMethod || "GET").toUpperCase();
  const rawQuery = event.queryString || "";
  const qs = event.queryStringParameters || null;

  if (method === "OPTIONS") return reply(204, CORS, "");

  let target, mode;
  if (qs && (qs.u || qs.mode)) {
    target = qs.u;
    mode = qs.mode;
  } else {
    const parsed = new URLSearchParams(rawQuery);
    target = parsed.get("u");
    mode = parsed.get("mode");
  }

  if (!target) {
    return reply(200, Object.assign({ "content-type": "text/plain; charset=utf-8" }, CORS),
      "班级云库 · WPS 代理已就绪。用法：?u=<编码后的 WPS 地址>&mode=phone|desktop");
  }
  if (!allowed(target)) return reply(403, CORS, "host not allowed");

  mode = mode === "desktop" ? "desktop" : "phone";

  /* 反代地址取本函数的 HTTP 入口，避免把内部路径写死 */
  const base = "https://" + (event.headers && (event.headers.host || event.headers.Host) || "") +
    "/" + (event.path || "/wps").replace(/^\//, "");

  const upHeaders = {
    "user-agent": UA[mode],
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
  };
  const inHeaders = event.headers || {};
  const ct = inHeaders["content-type"] || inHeaders["Content-Type"];
  if (ct) upHeaders["content-type"] = ct;
  const accept = inHeaders["accept"] || inHeaders["Accept"];
  if (accept && accept.indexOf("text/html") >= 0) upHeaders["accept"] = accept;
  const cookie = inHeaders["cookie"] || inHeaders["Cookie"];
  if (cookie) upHeaders["cookie"] = cookie;

  let body = event.body;
  if (body && event.isBase64Encoded) body = Buffer.from(body, "base64");

  let res;
  try {
    res = await pull(target, method, upHeaders, body);
  } catch (e) {
    return reply(502, CORS, "upstream error: " + e.message);
  }

  const ctype = (res.headers["content-type"] || "").toLowerCase();

  if (ctype.indexOf("text/html") < 0) {
    const out = Object.assign({}, CORS);
    if (ctype) out["content-type"] = res.headers["content-type"];
    return reply(res.status, out, res.buf.toString("base64"), true);
  }

  const out = Object.assign({}, CORS, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=30"
  });
  return reply(200, out, rewriteHtml(res.buf.toString("utf8"), target, mode, base));
};
