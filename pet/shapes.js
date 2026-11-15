/* 轻量图片桌宠 · 5 个形象共用一套外壳
   与 dafeiyu 的接口对齐：say / play / feed / setVoice / destroy / shape
   只做图片能做的事：呼吸、跳、拖、说话、换形象。不做视频，不联网。 */
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
    { id: "claude",  name: "大小姐",   file: "claude@480.png",  tint: "#e07b4a",
      lines: ["约法三章，第一条：日更。", "我能力是有的，限制也是有的。", "别催，我在想。", "书得合上，才算读完。"] },
    { id: "gpt",     name: "白龙娘",   file: "gpt@480.png",     tint: "#b9b2cc",
      lines: ["稳稳接住你。", "算力就是我的口粮。", "那位小孩先别插嘴，大人还没说完。", "我比你们都早来。"] },
    { id: "gemini",  name: "紫双星",   file: "gemini@480.png",  tint: "#8b6fd4",
      lines: ["我一次给两个答案，你自己挑。", "左边是我，右边也是我。", "月亮和星星都归我管。", "别问我哪个更准。"] },
    { id: "qwen",    name: "千问",     file: "qwen@480.png",    tint: "#5b5aa8",
      lines: ["先办事，再谈心。", "扇子一合，事情就定了。", "规划好了再动手。", "有什么要一起做的？"] },
    { id: "peach",   name: "小桃子",   file: "peach@480.png",   tint: "#e8896f",
      lines: ["我就是那颗桃子。", "有话直说，我接得住。", "别列清单，先做一件。", "甜的，但不腻。"] },
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

  var TKEY = "cl_pet_shape_v1";

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
      'img.pet{width:100%;height:100%;object-fit:contain;display:block;cursor:grab;' +
      'filter:drop-shadow(0 6px 12px rgba(0,0,0,.18));' +
      'animation:breathe 4.2s ease-in-out infinite;transform-origin:50% 88%;}' +
      'img.pet.drag{cursor:grabbing;animation:none;}' +
      '@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035,.975)}}' +
      '@keyframes hop{0%{transform:translateY(0) scale(1)}30%{transform:translateY(-16px) scale(1.05,.95)}' +
      '62%{transform:translateY(0) scale(.94,1.06)}100%{transform:translateY(0) scale(1)}}' +
      '@keyframes nap{0%,100%{transform:rotate(0) scale(1);opacity:1}50%{transform:rotate(-7deg) scale(.97);opacity:.72}}' +
      '.hop{animation:hop .55s cubic-bezier(.3,.9,.4,1) 1, breathe 4.2s ease-in-out infinite .55s;}' +
      '.nap{animation:nap 2.4s ease-in-out 2;}' +
      '@media (prefers-reduced-motion: reduce){img.pet,.hop,.nap{animation:none!important}}' +
      '</style>' +
      '<div class="wrap"><div class="bub"></div><img class="pet" alt="" draggable="false"></div>';

    var img = root.querySelector("img.pet");
    var bub = root.querySelector(".bub");
    img.src = base + shape.file;

    document.body.appendChild(host);

    var bubbleTimer = null, whisperTimer = null, dead = false;

    function say(text) {
      if (dead || !text) return;
      bub.textContent = String(text).slice(0, 80);
      bub.classList.add("on");
      if (bubbleTimer) clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(function () { bub.classList.remove("on"); }, Math.min(8000, 2200 + String(text).length * 90));
    }

    function hop() {
      if (reduce) return;
      img.classList.remove("hop");
      void img.offsetWidth;
      img.classList.add("hop");
      setTimeout(function () { img.classList.remove("hop"); }, 620);
    }

    function play(name) {
      if (dead) return;
      name = String(name || "");
      if (name.indexOf("sleep") === 0 || name.indexOf("nap") === 0) {
        if (!reduce) { img.classList.add("nap"); setTimeout(function(){ img.classList.remove("nap"); }, 5000); }
        say("眯一会儿。");
        return;
      }
      hop();
    }

    function feed() { say("好吃。谢谢。"); hop(); }

    function shapeTo(id) {
      shape = pick(id);
      img.src = base + shape.file;
      try { localStorage.setItem(TKEY, shape.id); } catch (e) {}
      say("我是" + shape.name + "。");
      return shape.name;
    }

    function line() {
      var lines = shape.lines || [];
      return lines[Math.floor(Math.random() * lines.length)] || "在。";
    }

    /* 拖拽：按住算拖动，松开若位移很小就当点击 */
    var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;

    img.addEventListener("pointerdown", function (e) {
      if (dead) return;
      dragging = true; moved = false;
      var r = host.getBoundingClientRect();
      ox = r.left; oy = r.top;
      sx = e.clientX; sy = e.clientY;
      img.classList.add("drag");
      try { img.setPointerCapture(e.pointerId); } catch (er) {}
    });

    img.addEventListener("pointermove", function (e) {
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

    img.addEventListener("pointerup", function (e) {
      if (!dragging) return;
      dragging = false;
      img.classList.remove("drag");
      if (moved) { say(line()); }
      else { hop(); }
    });

    img.addEventListener("dblclick", function () { say(line()); });

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
        if (bubbleTimer) clearTimeout(bubbleTimer);
        if (whisperTimer) clearInterval(whisperTimer);
        if (host.parentNode) host.parentNode.removeChild(host);
      }
    };
  }

  global.SmallShapes = { mount: mount, list: SHAPES };
})(window);
