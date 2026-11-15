# 班级云库 · 网络工程技术（本）2502班

广西农业职业技术大学网络工程技术（本）2502 班的班级资源门户。纯静态、单文件、无后端，上传到 GitHub 开 Pages 就能用。

## 它是什么

一个「索引」，不是「仓库」。

- 45 位同学的 WPS 独立文件夹 + 1 个班级共享云库，按姓名、学号后三位、端口序号检索
- 学校 7 个官方入口（智慧学工、资源访问控制、SSL VPN、官网、两个 FTP 节点等）
- 从学校资源访问控制系统抄录的 22 个校内资源系统目录
- 一页「课程」清单：Python、网络、Linux 三科从 0 到 60 分该抓哪几块、该放弃什么

页面里没有任何文档正文、附件、成绩数据。文件全部仍在学校 WPS 云文档里，谁能打开由 WPS 的分享权限决定。班委调权限不用改代码，WPS 里点几下即时生效。

**学号不在网页里存全。** 45 人的学号一律只保留后三位（如「238」），完整学号只存在于班级 WPS 云库。源码公开也不会带出完整学号。

## 目录结构

```
.
├── index.html        # 页面、样式、数据、逻辑（单文件，约 140 KB）
├── manifest.json     # PWA 清单：装到主屏后的名字、图标、启动参数
├── sw.js             # Service Worker：网络优先，断网回落到上一版
├── icon-192.png      # PWA 图标 192
├── icon-512.png      # PWA 图标 512
├── icon-180.png      # iOS 添加到主屏幕用的图标
├── proxy/
│   └── wps-proxy.js  # Cloudflare Worker（已部署，但 workers.dev 在国内不可达，故未启用）
├── 404.html          # 路径不存在时回首页
├── robots.txt        # 禁止搜索引擎收录
├── .nojekyll         # 关闭 Jekyll，保证文件原样发布
├── .gitignore        # 排除系统残留文件，对本项目没有实际作用，留着无害
└── README.md
```

`index.html` 自包含，单独把这个文件发给别人也能双击打开用，不依赖 `assets/` 或任何外部 CDN。PWA 相关的那几个文件只在 `https` 下生效，`file://` 双击打开时会被浏览器忽略，不影响页面本身。

## 部署到 GitHub Pages

1. 新建仓库，命名 `class-cloud-2502`（公开仓库才能免费用 Pages）。
2. 把本文件夹推上去。网页上传会卡在以点开头的文件（提示 `This file is hidden.`），所以用命令行：

   ```bash
   git init -b main
   git add -A
   git commit -m "班级云库门户"
   git remote add origin https://github.com/<用户名>/class-cloud-2502.git
   git push -u origin main
   ```

3. 打开 **Settings → Pages**，Source 选 `Deploy from a branch`，分支 `main`、目录 `/ (root)`，Save。
4. 等 1～2 分钟，访问 `https://<用户名>.github.io/class-cloud-2502/`。
5. 后续更新照旧 `git add -A && git commit && git push`，Pages 自动重新发布，链接不变。

仓库名必须小写、用连字符。用户名或仓库名改了，访问地址也会跟着变，届时需要重发二维码。

## 日常维护

改动都在 `index.html` 末尾的脚本区，两处：

```js
// 1) 访问口令
const GATE_CODE = "2502";

// 2) 名册
const MEMBERS = [
  { no:"201", name:"王苏子明", slug:"ctWvsvDFbsPW" },
  // ...
];
```

- **学号只写后三位**：`no` 字段填 `"201"` 这样的三位，不填完整学号。排序、检索、计数都会自动适应。
- **加人**：照抄一行，改后三位学号、姓名、`slug`。`slug` 取自 WPS 文件夹链接 `https://www.kdocs.cn/folder/xxxx` 里的 `xxxx` 那段。顶部刻度条会自动重算。
- **删人**：删掉对应一行即可。
- **换口令**：改 `GATE_CODE`。它写在源码里，只能挡住随手点开的人，不是真正的鉴权。
- **改学校入口**：`PORTALS`（官方入口）与 `RESOURCES`（校内资源目录）两个数组，格式照现有条目。
- `RESOURCES` 里带 `…` 的系统名，是原页面显示不全的截断，没有补全，不要凭猜改全名。
- **改课程清单**：`#/lessons` 那一段 HTML，三科各一张卡片，按「必得分块 + 放弃项 + 练习量」写。

## 先说清楚的三件事

**一、公开仓库仍然公开姓名与文件夹地址。** GitHub Pages 免费版只能挂公开仓库，任何人拿到链接都能看到 45 位同学的姓名和 WPS 文件夹地址。学号已经处理掉了（只存后三位），但姓名和文件夹 slug 依然在。页面另外做了两道遮挡：`noindex` 阻止搜索引擎收录、口令门挡住随手点开的人。这两道都不是安全措施。

如果班级不接受这种暴露，两条更稳的路：

- 用学校提供的主机或教育网空间托管，做真实登录鉴权；
- 名册只留「序号 + 姓名」，连后三位也不要。

文档本身不因网页公开而泄露，因为点开链接后 WPS 还会校验账号权限。

**二、内嵌预览大概率是空白，且「电脑 / 手机」要接代理才真生效。** WPS 和校内系统普遍设置了禁止外部页面嵌套（`X-Frame-Options` / `frame-ancestors`），这是对方的安全策略，无法绕过。另外，实测确认 WPS 是**在服务端按 UA 分发两套完全不同的页面**（桌面 `ShareFolder`、移动 `mShareFolder`，同一链接按 Windows UA 返回 2130 B、按 iPhone UA 返回 5070 B），而在网页里改不了 UA（`User-Agent` 属于 forbidden header，脚本设置会被静默丢弃）。所以预览窗那两个按钮只有在部署了 `proxy/wps-proxy.js`、并且把 `PROXY` 填成代理地址之后才真正换端（这个 Worker 已经部署好了，但 `workers.dev` 在国内被 DNS 污染、连不上，所以地址仍留空，详见下面的「电脑 / 手机 切换」）——那时是让 Worker 用手机 UA 去取移动版。没启用时点「手机」会直接弹二维码：用手机扫，WPS 本来就给移动版。真正的阅览与编辑始终在 WPS 里完成，权限也始终由 WPS 把关。

**三、FTP 不能用浏览器打开。** Chrome、Edge、Firefox 都已移除 `ftp://` 协议支持，点了没反应是正常的。点一下会复制地址，粘贴到 Windows 资源管理器地址栏或 FileZilla 里用，且必须在校内网。

## 校内资源目录的用法

那 22 条不直连域名，原因很简单：校外只能通过资源访问控制系统的代理进内网。正确路径是

1. 打开 `https://vpn.gxnzd.com.cn/login` 登录；
2. 在站内「资源站点」里点对应系统；
3. 校园网内则可以直接把域名补成 `https://` 访问，内网 IP 那几条通常是 `http://` 加端口。

目录里有两组重复地址（`172.16.5.70`、`10.0.100.33`），是原页面本来就这样，不是抄错。

## 装到主屏（PWA）

GitHub Pages 本身就是 `https`，所以这一套自动生效，不需要额外配置。

- **安卓（Chrome / Edge）**：进站后顶部会出一条「装到主屏」，点一下就装；浏览器没给这个入口时，用菜单里的「添加至主屏幕 / 安装应用」。
- **iPhone（Safari）**：只能手动——点底部中间的分享 □↑ → 「添加到主屏幕」。页面顶部会提示这一步。
- **微信 / QQ 内置浏览器**：装不了。先点右上角 ⋯ → 「在浏览器打开」，再按上面的步骤装。
- 装好后是全屏、无地址栏、独立图标；清单里的 `start_url` 带 `?embed=1`，进去就是移动端紧凑版。
- 电脑上想预览这条提示：地址后面加 `?env=1`。
- `sw.js` 会缓存一份页面壳，断网能打开页面框架；具体内容仍要联网（WPS 在外网）。

## 电脑 / 手机 切换（Worker 已部署，默认未启用）

WPS 在服务端按 UA 给两套壳，网页里改不了 UA，所以真切换只能让服务器替你去请求。`proxy/wps-proxy.js` 就是那个 Worker，**已经部署在班级账号的 Cloudflare 里**：

| 项 | 值 |
| --- | --- |
| Worker 名 | `cl-wps-proxy` |
| 地址 | `https://cl-wps-proxy.3534226279.workers.dev` |
| Cloudflare 账号 | `3534226279@qq.com`（account id `9b541232809822d0a0af2a7150310e47`） |
| 脚本类型 | classic（`addEventListener("fetch")`，Dashboard 在线编辑器和 API 都吃得下） |
| 最后部署 | 2026-11-15，走 API 直传 |

**但它在国内用不了。** 实测 `cl-wps-proxy.3534226279.workers.dev` 被 DNS 污染，解析到 `162.125.18.129`（Dropbox 的 IP），TCP 443 直接超时——`*.workers.dev` 在国内基本都这样。所以 `index.html` 里的 `let PROXY = ""` **保持为空**：点「手机」仍走弹二维码那条路，手机上扫码打开，WPS 本来就给移动版。

想让代理真生效，只有三条路：

1. **给这个 Worker 绑自定义域名**（Workers → Settings → Domains & Routes → Custom domain）。域名得解析到 Cloudflare、且国内可达；`workers.dev` 这一层绕不过去。
2. **换个国内可达的函数平台**（阿里云函数计算、腾讯云 SCF 之类），把 `proxy/wps-proxy.js` 的逻辑搬过去，只改 `PROXY` 地址。
3. **维持现状**。手机上本来就能看移动版，桌面看移动版是次要场景，弹二维码已经够用。

填上地址之后的行为：电脑上点「手机」，Worker 用 iPhone UA 去取 `mShareFolder`；手机上点「电脑」反过来。要撤回就把 `PROXY` 清空再推。

边界说清楚：只对**公开分享链接**有效（要登录才看得到的文档，Worker 没有你的账号态）；页面里的接口请求已被注入脚本改道到代理，但个别依赖个人空间的能力可能失效——能看、能翻目录、能预览，写操作别指望。

## 维护与稳定性

### 改什么，改哪里

| 要改的东西 | 位置 |
| --- | --- |
| 加人 / 删人 | `MEMBERS` 数组，`no` 只填学号后三位 |
| 换口令 | `GATE_CODE` |
| 学校入口 / 校内资源 | `PORTALS` / `RESOURCES` |
| 分区顺序与折叠 | `GROUPS`、`SUBS`、`ALIAS` |
| 图标 | 重新生成 `icon-*.png`，同尺寸覆盖即可，`manifest.json` 不用改 |
| 换端代理地址 | `index.html` 里的 `let PROXY = ""` |
| 改代理本身 | `proxy/wps-proxy.js`，改完按下面「更新 Worker」推上去 |
| 顶部提示条文案 | `#envbar` 那段脚本里的 `show(...)` 三个分支 |

### 推上去之后多久生效

- push 到 `main` 后 Pages 构建 1–2 分钟。验证时**一定要带随机参数**（`?t=123`），否则浏览器缓存会骗你，看起来像没更新。
- `sw.js` 是网络优先策略，改页面内容不用动它。**只有改了缓存清单 `SHELL` 才需要把 `CACHE` 从 `v1` 改成 `v2`**，否则老缓存会一直留着那批旧文件。
- 装到主屏的 PWA 不会因为刷新就更新界面，关掉图标重开一次才会拉新版。

### 更新 Worker（一条命令，别用网页编辑器）

Cloudflare 的在线编辑器是跨域 iframe 里的 Monaco，自动化粘贴进不去，手贴 150 行也容易漏。改完 `proxy/wps-proxy.js` 直接用 API 传：

```powershell
$acc  = "9b541232809822d0a0af2a7150310e47"
$tok  = "<7 天期的 API Token>"
$f    = "proxy\wps-proxy.js"
$meta = "I:\WindowsCache\Temp\cf-meta.json"

[IO.File]::WriteAllText($meta, '{"body_part":"worker.js","compatibility_date":"2025-01-01"}', (New-Object Text.UTF8Encoding $false))

curl.exe -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/$acc/workers/scripts/cl-wps-proxy" -H "Authorization: Bearer $tok" -F "metadata=@$meta;type=application/json" -F "worker.js=@$f;type=application/javascript"
```

返回 `"success": true` 就是上线了。四个坑：

- **Token 别用模板**。`Create Token` 里的「Edit Cloudflare Workers」模板带一条 Zone policy，这个账号没有域名，会卡在 `Choose a zone resource` 出不来。改用 `Start from scratch` → Account policy → `Workers Scripts: Edit`，有效期选 **7 days**，创建完立刻复制、用完就 Delete（页面关掉就再也看不到）。
- **metadata 必须走文件**。写成 `-F 'metadata={"main_module":"worker.js"}'` 会被 PowerShell 剥掉内层引号，服务端报 `invalid character 'm' looking for beginning of object key string`。
- **别写 `main_module`**。这个 Worker 是 classic 类型；带 `main_module`、或源码里有 `export default`，都会报 `Unexpected token 'export'`。所以 `wps-proxy.js` 用的是 `addEventListener("fetch", ...)` + 顶层 `async function handleRequest`，改代码时保持这个结构。
- **`curl.exe` 要写全路径**。PowerShell 里 `curl` 是 `Invoke-WebRequest` 的别名，写法不同会静默失败；用 `C:\Windows\system32\curl.exe`。

### 容易出问题的六个地方

1. **WPS 改版**。Worker 靠的是 WPS「服务端按 UA 分两套壳」这个行为。哪天它换目录结构，代理可能只返回壳、内容出不来。自查一行命令：

   ```powershell
   $h = @{ "User-Agent" = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
   $r = Invoke-WebRequest "https://www.kdocs.cn/folder/<slug>" -Headers $h -UseBasicParsing
   $r.RawContentLength; ($r.Content -match 'mShareFolder')
   ```

   返回 5000 字节上下、`mShareFolder` 为真，说明分流还在，代理能用；变成登录页或 2000 字节左右，说明手机壳的入口变了。

2. **Worker 免费额度**。每天 10 万请求，班级规模一年也用不到百分之一。别把白名单 `HOSTS` 扩大，否则它会变成公开代理，额度很快烧完还可能被封。

3. **WPS 限流**。同一个分享页被反复代理抓，可能触发风控返回验证页。Worker 里给的是 `cache-control: max-age=30`，别改成 0。真被限流时把 `PROXY` 临时清空即可——点「手机」会退回弹二维码，不影响任何人看文档。

4. **分享被撤回**。写着「永久有效」也会被分享者收回。撤回后代理拿到的是 WPS 的错误页，不是站点坏了。

5. **PWA 装不上**。按顺序排查：当前是不是 `https`（`file://` 一定不行）→ 是不是在微信 / QQ 内置浏览器 → DevTools → Application → Service Workers → Unregister 清掉旧壳再试。

6. **所有手机都看到旧版**。把 `sw.js` 里的 `CACHE = "class-cloud-2502-v1"` 改成 `v2` 再推，`activate` 阶段会清掉旧缓存。

### 出事了先做这一句

页面是单文件，改坏了直接回退：

```bash
git checkout HEAD~1 -- index.html
git commit -m "revert index.html" && git push
```

`manifest.json`、`sw.js`、图标这三样不动也能一直跑；换端代理是可选装饰，它坏了不影响任何人打开文档。

## 技术说明

- 原生 JavaScript，无框架、无构建、无 `type="module"`，`file://` 双击可用
- 数据固化在脚本里而不是 `fetch` JSON，因为 `file://` 下不能读本地文件
- 移动端优先设计，断点 640 / 1024
- 页内 hash 路由：两个组 `#/main`（概览·成员索引·学校入口·资料库）、`#/admin`（权限说明·高级功能·部署维护）；旧地址如 `#/home`、`#/library`、`#/desk` 仍然直达，会落到对应组
- 状态存在 `localStorage`：`cl_access_v1`（口令是否已通过）、`cl_envbar_v1`（顶部提示条是否被关掉）
- 不用 emoji，图标为内联 SVG；PWA 图标是 `System.Drawing` 画的 PNG，无第三方依赖
