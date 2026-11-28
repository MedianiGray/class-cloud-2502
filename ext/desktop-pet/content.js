/* 班级云库 · 大肥鱼桌宠扩展（MV3）
 * content.js 跑在扩展隔离世界：写素材基址配置、按序注入库与启动脚本到页面主世界。
 * 库 dafeiyu.iife.js 挂 window.Dafeiyu，init.js 在主世界调 mount 把鱼挂到 document.body。
 * 素材（webm 动画）复用门户线上 Pages 地址，扩展包本身不带 8.7 MB 视频。 */
(function () {
  if (window.__PET_EXT_BOOT) return;
  window.__PET_EXT_BOOT = true;

  /* 门户站内已有原生鱼（#petBar），扩展不再重复挂，避免一条页面两条鱼 */
  if (document.getElementById("petBar")) return;

  var ASSET_BASE = "https://medianigray.github.io/class-cloud-2502/pet/assets/";

  var cfg = document.createElement("meta");
  cfg.id = "ext-pet-cfg";
  cfg.dataset.asset = ASSET_BASE;
  (document.head || document.documentElement).appendChild(cfg);

  function loadScript(src, onload) {
    var s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = onload || null;
    (document.head || document.documentElement).appendChild(s);
  }

  function boot() {
    loadScript(chrome.runtime.getURL("dafeiyu.iife.js"), function () {
      loadScript(chrome.runtime.getURL("init.js"));
    });
  }

  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
})();
