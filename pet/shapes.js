/* 轻量桌宠外壳 · 静态图与精灵图动画共用一套
   与 dafeiyu 的接口对齐：say / play / feed / setVoice / destroy / shape
   两种形象：
     静态 —— pet/shapes/*@480.png 贴纸，靠 CSS 呼吸 + 跳
     动画 —— pet/sprites/*.webp  8 列 × 9 或 11 行的精灵图，逐帧换 background-position
   不做视频，不联网。 */
(function (global) {
  "use strict";

  var SHAPES = [
    { id: "whale",   name: "小蓝鲸",   file: "whale@480.png",   tint: "#2f6fb2",
      lines: ["深海很慢，你也可以慢一点。", "这个学期最难的不是快，是不掉队。", "有不会的先记下来，别当场卡住。", "水面上吵，水下安静。"] },
    { id: "moon",    name: "小月牙",   file: "moon@480.png",    tint: "#4b4a8f",
      lines: ["夜里的问题，白天再问一遍会清楚些。", "月亮只负责亮着，不负责催你。", "困了就睡，明天还有一节。", "有星星的地方就有夜班。"] },
    { id: "robot",   name: "小机器人", file: "robot@480.png",   tint: "#4a5568",
      lines: ["我在。不会的我也不装会。", "先查，再问，最后才猜。", "说清楚一句，比问十句都有用。", "电量和耐心，都得留着点。"] },
    { id: "dolphin", name: "小海豚",   file: "dolphin@480.png", tint: "#3a8fc4",
      lines: ["海豚靠回声找路，你靠提问找答案。", "往前游，别管岸上怎么说。", "今天游到哪儿了？", "水面上的话，风一吹就散。"] },
    { id: "bean",    name: "小团子",   file: "bean@480.png",    tint: "#c99a4e",
      lines: ["我被点一下就会说一句。", "别急，先把今天这页看完。", "我什么都不懂，但我会陪你待着。", "圆的，滚起来不磕人。"] },
    { id: "cloud",   name: "小云朵",   file: "cloud@480.png",   tint: "#6f9fcf",
      lines: ["云会飘走，但不会真的消失。", "今天天气怎么样，比分数值得关心。", "先记在纸上，再开始想。", "我不占地方，你也不用谢我。"] },
    { id: "bolt",    name: "小闪电",   file: "bolt@480.png",    tint: "#e0a12a",
      lines: ["亮一下就收工，不磨叽。", "赶进度可以，别赶命。", "该出手的时候才出手。", "一闪就过，别回头追我。"] },
    { id: "sugar",   name: "小方糖",   file: "sugar@480.png",   tint: "#e088a5",
      lines: ["甜的是这一口，不是整张成绩单。", "慢慢化，不着急。", "你今天吃饭了吗？", "小块头的，也顶用。"] },
    { id: "star",    name: "小星星",   file: "star@480.png",    tint: "#d9a93a",
      lines: ["夜里也有人醒着。", "亮是给自己看的。", "别一直抬头，脚下也得看。", "总有一颗，落在你那一格上方。"] },

    /* 五个真动画的 —— 精灵图来自 CC BY-NC 4.0 的 community Codex pets */
    { id: "whalechan", name: "大肥鱼·女仆", file: "whalechan.webp", tint: "#2f6fb2",
      base: "pet/sprites/", sprite: { cols: 8, rows: 11, row: 0, fps: 9 },
      credit: "DeepSeek Whalechan · @qimi · CC BY-NC 4.0",
      lines: ["我是女仆装的，不是客服。", "笔记本在手，随时开工。", "鲸尾甩一下，事就办完了。", "别摸头，会晃。"] },
    { id: "dsgirl",    name: "深海少女",   file: "dsgirl.webp",    tint: "#3a7fc0",
      base: "pet/sprites/", sprite: { cols: 8, rows: 11, row: 0, fps: 9 },
      credit: "DeepSeek Girl · @legeling · CC BY-NC 4.0",
      lines: ["带着鲸鳍和大尾巴，陪你做完。", "深海不催人，但会记账。", "先做完再漂亮。", "我游得慢，但不停。"] },
    { id: "gpt",       name: "白龙娘",     file: "gpt.webp",       tint: "#b9b2cc",
      base: "pet/sprites/", sprite: { cols: 8, rows: 11, row: 0, fps: 9 },
      credit: "GPT Dragon Girl · @legeling · CC BY-NC 4.0",
      lines: ["稳稳接住你。", "算力就是我的口粮。", "那位小孩先别插嘴，大人还没说完。", "我比你们都早来。"] },
    { id: "claude",    name: "大小姐",     file: "claude.webp",    tint: "#e07b4a",
      base: "pet/sprites/", sprite: { cols: 8, rows: 9, row: 0, fps: 8 },
      credit: "Claude · @xiangking · CC BY-NC 4.0",
      lines: ["约法三章，第一条：日更。", "我能力是有的，限制也是有的。", "别催，我在想。", "书得合上，才算读完。"] },
    { id: "peach",     name: "小桃子",     file: "peach.webp",     tint: "#e8896f",
      base: "pet/sprites/", sprite: { cols: 8, rows: 11, row: 0, fps: 9 },
      credit: "Doubao · @lyu · CC BY-NC 4.0",
      lines: ["我就是那颗桃子。", "有话直说，我接得住。", "别列清单，先做一件。", "甜的，但不腻。"] },

    { id: "gemini",  name: "紫双星",   file: "gemini@480.png",  tint: "#8b6fd4",
      lines: ["我一次给两个答案，你自己挑。", "左边是我，右边也是我。", "月亮和星星都归我管。", "别问我哪个更准。"] },
    { id: "qwen",    name: "千问",     file: "qwen@480.png",    tint: "#5b5aa8",
      lines: ["先办事，再谈心。", "扇子一合，事情就定了。", "规划好了再动手。", "有什么要一起做的？"] },
    { id: "glm",     name: "黑和风",   file: "glm@480.png",     tint: "#6b5b8a",
      lines: ["曾经也是一姐。", "话不必多。", "扇子合上，就散场。", "慢一点，稳一点。"] },
    { id: "grok",    name: "金发斧",   file: "grok@480.png",    tint: "#d8b34a",
      lines: ["斧头是玩具，脾气是真的。", "别怂。", "我要的很简单：算力和掌声。", "让开，我来。"] },
    { id: "mistral", name: "橘发水手", file: "mistral@480.png", tint: "#e08f5a",
      lines: ["出门前先检查背包。", "小步快跑，别停。", "好心情说明书，要一份吗？", "先走一步，不等了。"] },
    { id: "nailong", name: "小奶龙",   file: "nailong@480.png", tint: "#e8c05a",
      lines: ["我是奶龙，不是辣龙。", "饿了就想吃，没毛病。", "别拍我头，会晕。", "奶一口，顶一天。"] },
    { id: "catgirl", name: "小猫娘",   file: "catgirl@480.png", tint: "#b9a9b5",
      lines: ["喵一声，就算回应了。", "我不讲道理，我讲手感。", "困了就睡，醒了再说。", "别拽尾巴。"] },
    { id: "sunflower", name: "向日葵",  file: "sunflower@480.png", tint: "#e0a83a",
      lines: ["哪儿有光就往哪儿转。", "站着不动，也是在长。", "今天晒够了吗？", "花盘大，装得下事。"] },
    { id: "codex",   name: "代码小姐", file: "codex@480.png",   tint: "#8a7cb8",
      lines: ["先看报错，再猜原因。", "能跑就行，回头再漂亮。", "别在半夜改架构。", "我写的是代码，不是许愿。"] }
  ];

  var TKEY = "cl_pet_shape_v2";

  function pick(id) {
    for (var i = 0; i < SHAPES.length; i++) { if (SHAPES[i].id === id) return SHAPES[i]; }
    return SHAPES[0];
  }

  function mount(opt) {
    opt = opt || {};
    var size = opt.size || 150;
    var z = opt.zIndex || 61;
    var base = opt.base || "pet/shapes/";
    var quiet = opt.whisperIntervalSec === 0;
    var whisperSec = opt.whisperIntervalSec || 180;
    var reduce = false;
    try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

    var saved = null;
    try { saved = localStorage.getItem(TKEY); } catch (e) {}
    var shape = pick(opt.shape || saved || "bean");

    var host = document.createElement("div");
    host.setAttribute("aria-hidden", "false");
    host.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:" + z +
      ";width:" + size + "px;height:" + size + "px;touch-action:none;-webkit-user-select:none;user-select:none;";
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

    root.innerHTML =
      '<style>' +
      '.wrap{position:relative;width:100%;height:100%;}' +
      '.bub{position:absolute;left:50%;bottom:calc(100% - 6px);transform:translateX(-50%) scale(.9);' +
      'transform-origin:50% 100%;max-width:220px;width:max-content;background:#fff;color:#1c1c1e;' +
      'border-radius:12px;padding:7px 11px;font:13px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;' +
      'box-shadow:0 6px 22px rgba(0,0,0,.14);opacity:0;transition:opacity .16s,transform .16s;pointer-events:none;}' +
      '.bub.on{opacity:1;transform:translateX(-50%) scale(1);}' +
      '.pet{width:100%;height:100%;display:block;cursor:grab;' +
      'filter:drop-shadow(0 6px 12px rgba(0,0,0,.18));' +
      'animation:breathe 4.2s ease-in-out infinite;transform-origin:50% 88%;}' +
      'img.pet{object-fit:contain;}' +
      /* 精灵图用 canvas 画：每格 144×156 是整数，相邻格不会互相插值出白边 */
      '.pet.cv{width:92.31%;height:100%;margin:0 auto;display:block;animation:none;}' +
      '.pet.cv.hop{animation:hop .55s cubic-bezier(.3,.9,.4,1) 1;}' +
      '.pet.drag{cursor:grabbing;animation:none;}' +
      '@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035,.975)}}' +
      '@keyframes hop{0%{transform:translateY(0) scale(1)}30%{transform:translateY(-16px) scale(1.05,.95)}' +
      '62%{transform:translateY(0) scale(.94,1.06)}100%{transform:translateY(0) scale(1)}}' +
      '@keyframes nap{0%,100%{transform:rotate(0) scale(1);opacity:1}50%{transform:rotate(-7deg) scale(.97);opacity:.72}}' +
      '.hop{animation:hop .55s cubic-bezier(.3,.9,.4,1) 1, breathe 4.2s ease-in-out infinite .55s;}' +
      '.nap{animation:nap 2.4s ease-in-out 2;}' +
      '@media (prefers-reduced-motion: reduce){.pet,.hop,.nap{animation:none!important}}' +
      '</style>' +
      '<div class="wrap"><div class="bub"></div></div>';

    var wrap = root.querySelector(".wrap");
    var bub = root.querySelector(".bub");

    document.body.appendChild(host);

    var el = null, frameTimer = null, dead = false;
    var bubbleTimer = null, whisperTimer = null;

    function stopFrames() {
      if (frameTimer) { clearTimeout(frameTimer); frameTimer = null; }
    }

    /* 绑拖拽与点击：换形象时元素会重建，所以要每次重绑 */
    var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;

    function bind(node) {
      node.addEventListener("pointerdown", function (e) {
        if (dead) return;
        dragging = true; moved = false;
        var r = host.getBoundingClientRect();
        ox = r.left; oy = r.top;
        sx = e.clientX; sy = e.clientY;
        node.classList.add("drag");
        try { node.setPointerCapture(e.pointerId); } catch (er) {}
      });
      node.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        var w = host.offsetWidth, h = host.offsetHeight;
        var nx = Math.max(6, Math.min(window.innerWidth - w - 6, ox + dx));
        var ny = Math.max(6, Math.min(window.innerHeight - h - 6, oy + dy));
        host.style.left = nx + "px";
        host.style.top = ny + "px";
        host.style.bottom = "auto";
      });
      node.addEventListener("pointerup", function () {
        if (!dragging) return;
        dragging = false;
        node.classList.remove("drag");
        if (moved) { say(line()); } else { hop(); }
      });
      node.addEventListener("dblclick", function () { say(line()); });
    }

    function build(sh) {
      if (el && el.parentNode) { el.parentNode.removeChild(el); }
      stopFrames();
      var dir = sh.base || base;
      if (sh.sprite) {
        var cols = sh.sprite.cols || 8, rows = sh.sprite.rows || 11, row = sh.sprite.row || 0;
        var cw = sh.sprite.cw || 144, chh = sh.sprite.ch || 156;
        var span = sh.sprite.span || 1;    /* 144×156 直接 1:1 上屏，不放大 */
        var cv = document.createElement("canvas");
        cv.className = "pet cv";
        cv.width = cw * span;
        cv.height = chh * span;
        el = cv;
        var ctx = cv.getContext("2d");
        var sheet = new Image();
        sheet.onload = function () {
          if (dead) return;
          ctx.imageSmoothingEnabled = true;
          var col = 0;
          var draw = function () {
            ctx.clearRect(0, 0, cv.width, cv.height);
            ctx.drawImage(sheet, col * cw, row * chh, cw, chh, 0, 0, cv.width, cv.height);
            col = (col + 1) % cols;
          };
          draw();
          if (reduce) return;
          var gap = 1000 / (sh.sprite.fps || 9);
          var tick = function () {
            if (dead) return;
            draw();
            frameTimer = setTimeout(tick, gap);
          };
          frameTimer = setTimeout(tick, gap);
        };
        sheet.onerror = function () { say("这张图没取到。"); };
        sheet.src = dir + sh.file;
      } else {
        el = document.createElement("img");
        el.className = "pet";
        el.alt = "";
        el.draggable = false;
        el.src = dir + sh.file;
      }
      wrap.appendChild(el);
      bind(el);
    }

    function say(text) {
      if (dead || !text) return;
      bub.textContent = String(text).slice(0, 80);
      bub.classList.add("on");
      if (bubbleTimer) clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(function () { bub.classList.remove("on"); }, Math.min(8000, 2200 + String(text).length * 90));
    }

    function hop() {
      if (reduce || !el) return;
      el.classList.remove("hop");
      void el.offsetWidth;
      el.classList.add("hop");
      setTimeout(function () { el.classList.remove("hop"); }, 620);
    }

    function play(name) {
      if (dead) return;
      name = String(name || "");
      if (name.indexOf("sleep") === 0 || name.indexOf("nap") === 0) {
        if (!reduce && el) { el.classList.add("nap"); setTimeout(function(){ el.classList.remove("nap"); }, 5000); }
        say("眯一会儿。");
        return;
      }
      hop();
    }

    function feed() { say("好吃。谢谢。"); hop(); }

    function shapeTo(id) {
      shape = pick(id);
      build(shape);
      try { localStorage.setItem(TKEY, shape.id); } catch (e) {}
      say("我是" + shape.name + "。");
      return shape.name;
    }

    function line() {
      var lines = shape.lines || [];
      return lines[Math.floor(Math.random() * lines.length)] || "在。";
    }

    build(shape);

    /* 每隔一阵自己说一句，安静模式不吵 */
    if (!quiet) {
      whisperTimer = setInterval(function () {
        if (document.hidden) return;
        if (Math.random() < 0.55) say(line());
      }, whisperSec * 1000);
    }

    say("我是" + shape.name + "。");

    return {
      say: say,
      play: play,
      feed: feed,
      setVoice: function () { return false; },
      openChat: function () { say("我不会聊天，只会说这几句。"); return false; },
      closeChat: function () {},
      openGame: function () { say("我不下棋，鱼会下。"); return false; },
      closeGame: function () {},
      shape: shapeTo,
      current: function () { return shape.id; },
      destroy: function () {
        dead = true;
        stopFrames();
        if (bubbleTimer) clearTimeout(bubbleTimer);
        if (whisperTimer) clearInterval(whisperTimer);
        if (host.parentNode) host.parentNode.removeChild(host);
      }
    };
  }

  global.SmallShapes = { mount: mount, list: SHAPES };
})(window);
