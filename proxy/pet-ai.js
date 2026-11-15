/**
 * 班级云库 · 大肥鱼 AI 后端（Cloudflare Worker，经典结构，与 wps-proxy.js 同一写法）
 *
 * 它解决的问题：网页是纯静态的，任何写进页面的 key 都等于公开。
 * 所以 key 只放 Worker 的变量里，页面只 POST {messages}，Worker 去换真话回来。
 *
 * ── 协议（宠物端写死的，别改）───────────────────────────────────
 * 收到：POST /chat   body { "messages": [ {"role":"user","content":"..."} ] }
 * 返回：text/event-stream，一行一个 data:
 *        data: {"d":"增量文字"}
 *        data: [DONE]
 *        data: {"e":"错误说明"}
 *
 * ── 部署（约 2 分钟）───────────────────────────────────────────
 * 1. dash.cloudflare.com → Workers & Pages → Create → Worker
 * 2. 粘本文件 → Deploy
 * 3. Settings → Variables and Secrets，加这三条：
 *      AI_PROVIDER   deepseek | moonshot | dashscope | zhipu | volc | openai
 *      AI_KEY        （那家的 key，设为 Secret）
 *      AI_MODEL      可空，走下面的默认值
 * 4. 回 index.html：PET_AI 常量填 https://xxx.workers.dev/chat，再推送
 *
 * ── 防护（这是班级站，不是你的私人玩具）────────────────────────────
 * · 只认班级站和本地调试的 Origin，别处一律 403
 * · 每个 IP 每天 40 次，超了直接拒（防同学乱点烧额度）
 * · 只收 6 条历史、每条 240 字，输出上限 240 tokens
 * · 不开 whisper 自动说话：那是每 200 秒一次，接上 AI 就是白烧钱
 *   宠物定时的碎碎念仍走本地台词池
 */

const PROVIDERS = {
  deepseek:  { base: "https://api.deepseek.com/v1",                model: "deepseek-chat" },
  moonshot:  { base: "https://api.moonshot.cn/v1",                 model: "moonshot-v1-8k" },
  dashscope: { base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  zhipu:     { base: "https://open.bigmodel.cn/api/paas/v4",        model: "glm-4-flash" },
  volc:      { base: "https://ark.cn-beijing.volces.com/api/v3",   model: "" },
  openai:    { base: "https://api.openai.com/v1",                  model: "gpt-4o-mini" }
};

/* 只放行这两个来源：线上站、本地调试。别改成 *，否则谁都能白嫖你的额度。 */
const ORIGINS = [
  "https://medianigray.github.io",
  "http://127.0.0.1:8766",
  "http://localhost:8766"
];

const DAILY_LIMIT = 40;

const SYSTEM = [
  "你是「大肥鱼」，广西农职大网络工程技术（本）2502 班云库首页上的一只蓝色小鲸。",
  "说话像班里那个懂点技术、话不多但靠得住的同学，不是客服，不是老师。",
  "规矩：",
  "1. 一次最多两句话，总共不超过 45 个字，能短就短。",
  "2. 不编。不知道就说「这个我不清楚，问学委去」。",
  "3. 只有页面里确实有地址的东西才能提：首页三张卡是专业学习资料、校内资源站、学校信息入口；",
  "   成员索引是 45 个格子按学号后三位；共享库是首页下面那一行。别自己造链接。",
  "4. 只答学习、资料、学校系统这类事。不聊政治，不评价老师和同学，不替人写作业。",
  "5. 平实说话，不堆感叹号，不用 emoji，不用「亲爱的」这类称呼。"
].join("\n");

function cors(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST,OPTIONS",
    "vary": "Origin"
  };
}

function originOk(o) {
  if (!o) return true; /* 同源或非浏览器请求，交给限流兜底 */
  return ORIGINS.indexOf(o) >= 0;
}

function clip(s, n) {
  s = String(s == null ? "" : s);
  return s.length > n ? s.slice(0, n) : s;
}

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const rows = raw.slice(-6);
  for (const m of rows) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    const text = clip(m.content, 240).trim();
    if (text) out.push({ role: role, content: text });
  }
  return out;
}

/* 按 IP 每天计数。Cache API 是每机房各算各的，跨地域不共享，
   对班级这个量级够用；真要更严，换 KV 或 Durable Objects。 */
async function bump(ip) {
  const day = new Date().toISOString().slice(0, 10);
  const key = new URL("https://ratelimit.local/" + encodeURIComponent(ip) + "/" + day);
  const cache = caches.default;
  const hit = await cache.match(key);
  const n = hit ? (parseInt(await hit.text(), 10) || 0) : 0;
  await cache.put(key, new Response(String(n + 1), {
    headers: { "cache-control": "max-age=86400" }
  }));
  return n + 1;
}

/* OpenAI 的流 → 宠物认的流。上游若不给流，就一次性塞成一帧。 */
function makePump() {
  let buf = "";
  let ended = false;
  return new TransformStream({
    transform(chunk, ctrl) {
      buf += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line.indexOf("data:") !== 0) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          if (!ended) { ended = true; ctrl.enqueue("data: [DONE]\n\n"); }
          continue;
        }
        try {
          const evt = JSON.parse(payload);
          const d = evt && evt.choices && evt.choices[0] && evt.choices[0].delta && evt.choices[0].delta.content;
          if (typeof d === "string" && d) {
            ctrl.enqueue('data: {"d":' + JSON.stringify(d) + "}\n\n");
          }
        } catch (e) { /* 忽略心跳和空帧 */ }
      }
    },
    flush(ctrl) { if (!ended) { ended = true; ctrl.enqueue("data: [DONE]\n\n"); } }
  });
}

async function handleChat(request, env, origin) {
  const head = cors(origin);

  if (!originOk(origin)) {
    return new Response("origin not allowed", { status: 403, headers: head });
  }

  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const used = await bump(ip);
  if (used > DAILY_LIMIT) {
    return new Response(JSON.stringify({ message: "今天聊够了，明天再来" }), {
      status: 429, headers: { ...head, "content-type": "application/json; charset=utf-8" }
    });
  }

  const name = (env && env.AI_PROVIDER) || "deepseek";
  const prov = PROVIDERS[name];
  if (!prov) {
    return new Response(JSON.stringify({ message: "Worker 里 AI_PROVIDER 填错了" }), {
      status: 500, headers: { ...head, "content-type": "application/json; charset=utf-8" }
    });
  }
  const key = (env && env.AI_KEY) || "";
  if (!key) {
    return new Response(JSON.stringify({ message: "Worker 还没填 AI_KEY" }), {
      status: 500, headers: { ...head, "content-type": "application/json; charset=utf-8" }
    });
  }
  const model = (env && env.AI_MODEL) || prov.model;
  if (!model) {
    /* 火山方舟（豆包）是这几家里唯一必须自己填的：它按「推理接入点」计费，
       光有 key 不够，还得在控制台建一个接入点，把 ep- 开头的 ID 填进来。
       填模型 ID（如 doubao-seed-...）在新版方舟上也认；两个都不对时，
       上游会回 400 并列出可用值，照那个改就行。 */
    const msg = name === "volc"
      ? "火山方舟（豆包）要填 AI_MODEL：控制台 → 在线推理 → 创建接入点 → 复制 ep- 开头的 ID"
      : "这个服务商必须填 AI_MODEL";
    return new Response(JSON.stringify({ message: msg }), {
      status: 500, headers: { ...head, "content-type": "application/json; charset=utf-8" }
    });
  }

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const msgs = cleanMessages(body && body.messages);
  if (!msgs.length) {
    return new Response(JSON.stringify({ message: "没听清，再说一遍" }), {
      status: 400, headers: { ...head, "content-type": "application/json; charset=utf-8" }
    });
  }

  const upstream = await fetch(prov.base + "/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer " + key
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "system", content: SYSTEM }].concat(msgs),
      stream: true,
      max_tokens: 240,
      temperature: 0.6
    })
  }).catch(function (e) { return new Response("upstream: " + e.message, { status: 502 }); });

  if (!upstream.ok) {
    let msg = "那边没接住（" + upstream.status + "）";
    try {
      const j = await upstream.json();
      const m = j && (j.error && (j.error.message || j.error.code));
      if (m) msg = clip(m, 60);
    } catch (e) { /* 保留默认文案 */ }
    return new Response(JSON.stringify({ message: msg }), {
      status: 502, headers: { ...head, "content-type": "application/json; charset=utf-8" }
    });
  }

  const ctype = upstream.headers.get("content-type") || "";
  if (ctype.indexOf("text/event-stream") < 0) {
    /* 这家没按流回，就读完整 JSON 一次吐完 */
    const j = await upstream.json().catch(function () { return null; });
    const txt = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    const one = "data: {\"d\":" + JSON.stringify(clip(txt, 200) || "……") + "}\n\ndata: [DONE]\n\n";
    return new Response(one, { status: 200, headers: { ...head, "content-type": "text/event-stream; charset=utf-8" } });
  }

  return new Response(upstream.body.pipeThrough(makePump()), {
    status: 200,
    headers: {
      ...head,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no"
    }
  });
}

async function handleRequest(request, env) {
  const origin = request.headers.get("origin") || "";
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  if (request.method === "GET") {
    return new Response(
      "班级云库 · 大肥鱼 AI 后端已就绪。宠物端 POST /chat，body {\"messages\":[...]}。",
      { status: 200, headers: { ...cors(origin), "content-type": "text/plain; charset=utf-8" } }
    );
  }

  if (url.pathname !== "/chat") {
    return new Response("not found", { status: 404, headers: cors(origin) });
  }

  return handleChat(request, env, origin);
}

addEventListener("fetch", function (event) {
  event.respondWith(handleRequest(event.request, event.env || self));
});
