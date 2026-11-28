/* 主世界启动脚本：库加载完成后读配置 meta，把大肥鱼挂到页面左下角。
 * 本文件由 content.js 以扩展资源脚本方式注入，运行在页面主世界（可访问 window/DOM）。 */
(function () {
  if (window.__PET_EXT_MOUNTED) return;
  if (!window.Dafeiyu || typeof window.Dafeiyu.mount !== "function") return;

  var cfg = document.getElementById("ext-pet-cfg");
  var assetBase = cfg && cfg.dataset.asset ? cfg.dataset.asset : "";

  var w = window.innerWidth || 1280;
  var size = w < 480 ? 118 : (w < 700 ? 146 : 170);

  try {
    window.__PET_EXT = window.Dafeiyu.mount({
      assetBase: assetBase,
      size: size,
      position: "bottom-left",
      zIndex: 99999,
      name: "大肥鱼",
      whisperIntervalSec: 200,
      enabledOnMobile: true,
      pageContext: true
    });
    window.__PET_EXT_MOUNTED = true;
  } catch (e) {
    /* 挂不上不影响页面本身 */
  }
})();
