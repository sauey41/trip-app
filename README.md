# 贝克旅行 · 旅行手册与编辑后台

前台 `/`，后台 `/admin`。支持保存多趟旅行并在前后台切换；每趟旅行独立管理每日行程、交通备选路线、酒店与航班、票券附件、出行清单及攻略笔记。支持新增、编辑、排序、复制、删除和 JSON 导入导出；保存后刷新前台可见。

## Docker 部署

```sh
docker compose pull
docker compose up -d
```

打开 `http://服务器IP:8080/admin`。**第一次打开时，在页面输入两次密码完成初始化**，不需要密码环境变量。密码至少 12 个字符，以加盐 scrypt 哈希保存在数据卷 `auth.json`，重启与更新不会重置。初始化只允许成功一次，之后均为登录。

也可独立运行：

```sh
docker run -d --name trip-app --restart unless-stopped \
  -p 8080:8080 \
  -v trip-data:/app/data \
  -v trip-runtime:/app/runtime \
  ghcr.io/sauey41/trip-app:latest
```

镜像支持 `linux/amd64` 和 `linux/arm64`。GitHub Actions 测试通过后构建发布。若 GHCR 包私有，请先登录 GHCR 或由所有者把包设为公开。

前台数据、导出及附件也需要登录。第一次初始化前请先由自己打开管理页设置密码。HTTPS 反向代理后设置 `COOKIE_SECURE=true`；本地 HTTP 保持默认 false。反向代理应保留 Host，允许至少 12 MB 请求体。远程公网部署请配合 HTTPS。

## 后台源码更新

后台 → **系统更新** → 检查更新 → 更新到此版本。

- 更新来源固定为 `https://github.com/sauey41/trip-app.git` 的 main 分支，不接受任意仓库或命令。
- 获取精确提交版本，下载至运行卷的独立目录，执行语法检查及完整测试后才切换。
- 新进程启动失败自动回退。也可手动「回退上一版本」。切换期间短暂不可用，切换后重新登录。
- `/app/data` 中的行程、密码和附件保留；代码在 `/app/runtime` 中，不改写镜像层、不挂载 Docker socket。
- 镜像升级时会优先采用新镜像内置代码。旧源码仍留在运行卷中。
- Node.js、系统依赖、启动器协议或第三方包变化需要更新 Docker 镜像；源码更新只接受 `runtimeApiVersion: 1` 且依赖列表与当前镜像相同的版本。
- 需要容器能通过 HTTPS 访问 GitHub。下载或测试失败保留当前代码。

旧版 `trip.json` 在首次写入时自动迁移到 `trips.json`，旧文件保留。未来涉及破坏性数据迁移时应先完整备份并使用相应镜像版本。运行卷保留历史版本与失败的下载，长期使用可在停机备份后清理不用的目录。

## 多行程与 MiMo 整理

后台「全部旅行」可新建、切换和删除旅行。切换后该旅行成为前台默认展示的内容；前台也可自行选择其他旅行。删除旅行会保留磁盘上的附件文件，完整删除前请先导出 JSON 或备份数据卷。

后台「AI 整理行程」中填写小米 MiMo API Key 和模型名称，点击「保存密钥和模型」。可以粘贴飞书知识库链接，点击「读取飞书正文」，在输入框核对提取文本后再分类；也可以直接粘贴正文或读取 TXT / Markdown。模型默认是 `mimo-v2.6-pro`，也可以选择其他 MiMo 文本模型。密钥保存在数据卷 `mimo.json`，不会回传给浏览器，也不会进入 GitHub 仓库或 Docker 镜像。原文发送到 [Xiaomi MiMo Chat Completions API](https://mimo.mi.com/docs/zh-CN/api/chat/openai-api)。接口遇到 429 会短暂退避重试；同一实例同一时间仅执行一个整理请求。若 AI 漏写标题，预览中会显示待核对的占位名称，确认后可在编辑区修改。

固定提示词位于 `lib/ai.mjs` 的 `ORGANIZER_PROMPT`。它要求按日期和时间线提取行程，将机票、车票、酒店确认单和门票归入票券，将餐厅、参观与服务预约归入预订；只把明确有确认依据的记录标为已确认。重复、广告和闲聊列为跳过项，缺失或模糊的信息留空并列为待核对项。用户原文只作为资料，不会覆盖提示词规则。AI 返回后先进行结构校验并显示预览，可建立新旅行、按日期与标题去重后合并到当前旅行，或替换当前旅行编辑区。后两种方式仍需人工检查并点击保存。输入框中的纯网址会先触发飞书正文读取，不会直接作为行程原文发送给 MiMo。链接读取只支持 `my.feishu.cn/wiki/`，使用隔离的访客浏览器提取页面中的正文；需要登录、未授权或页面结构不兼容时会提示改为复制正文。

## 私有数据与迁移

私人行程和订单凭证**不在公开仓库或镜像中**。新部署默认为空旅行。

只导入行程：后台 → 备份与迁移 → 导入 JSON → 检查 → 保存。JSON 不包含附件文件。

完整导入私有 ZIP：解压到 `trip-data`，里面应有 `trip.json` 和 `attachments/`。首次部署且尚未编辑前执行：

```sh
docker compose cp ./trip-data/. trip:/app/data
docker compose exec --user root trip chown -R node:node /app/data
docker compose restart trip
```

已有数据时请先备份，避免覆盖。数据包不含初始密码，仍由你在管理页设置。

数据目录内容：

- `trips.json`：全部行程、各自的版本号和默认行程。
- `trips.previous.json`：前一次数据快照。
- `trip.json`：旧版单行程数据，迁移后原样保留。
- `auth.json`：管理密码哈希。
- `mimo.json`：后台保存的 MiMo API Key。
- `attachments/`：PDF / PNG / JPG 凭证，每个上传最大 12 MB。

后台备份 JSON 不含密码和附件；完整备份请保存整个 `/app/data`。更新镜像或源码均需保留数据卷。不要使用 `docker compose down -v`，它会删除数据卷。

文件保存采用串行写入、原子替换与版本冲突检查。一个数据卷仅由一个应用进程写入，不支持多个副本共享写入。会话有效期 12 小时，退出或服务重启后失效。移除附件关联不会自动删除物理文件，方便恢复。

忘记密码时，由服务器管理员停止应用并备份 `/app/data/auth.json`，再移走该文件，重新启动后在管理页设置新密码。不要在应用运行时直接编辑密码文件。

## 本地运行与测试

Node.js 22+，源码更新还需要 Git。先运行 `pnpm install` 安装 Node 依赖。飞书链接读取需要本机安装 Chromium 或 Chrome，并通过 `CHROMIUM_PATH` 指定可执行文件；Docker 镜像已内置 Chromium。

```sh
pnpm install
node launcher.mjs
node --test
```

默认端口 `8080`。`PORT`、`DATA_DIR`、`RUNTIME_DIR` 可选；未设置时使用本地 `data/` 和 `runtime/`。健康检查为 `/healthz`。仅运行 `node server.mjs` 也能使用编辑功能，但源码更新入口不可用。

测试覆盖首次密码初始化、重复初始化竞争、密码哈希持久化、登录限流、CSRF、附件鉴权、版本冲突、重启持久化、非法导入、HTML 转义、新版本切换和自动回退。CI 还检查只读容器挂载数据卷后的实际登录与保存。

这是一个共享密码、多趟旅行的系统。首次 PDF 由人工整理；AI 整理支持公开可读的飞书知识库链接、粘贴文本和 TXT / Markdown，JSON 导入支持本系统备份。暂不自动识别 PDF。当前大阪与神户旅行的初始“行程说明”主要来自首次 PDF 的人工整理，后来部分购物行程按飞书文档更新。

新飞书文稿可按以下格式整理，每个「扩展」都会在该行程下生成独立的同名折叠模块；后台也可手动新增、编辑和删除扩展。文档内直接插入的照片仍按相邻行程关联：

```text
10月15日（周四）｜大阪
12:20 - 13:35 | JR大阪站（前往酒店）
摘要：根据发车时间选择更早抵达大阪站的列车。
提醒：HARUKA 需另购特急券。
【扩展｜参考车次】
12:14 发车 → 13:01 抵达
12:44 发车 → 13:31 抵达
【扩展｜交通方案】
方案 A：HARUKA；方案 B：关空快速。
```

「摘要」显示在行程正文，「提醒／提醒项」沿用高亮提示框。MiMo 漏掉时间节点时，会从这些结构化原文中补回该节点并在预览里提示核对；命名扩展不会因此丢失。没有 `【扩展｜名称】` 标记的旧行程仍使用「其他提示」折叠模块。

## 源码结构

`lib/model.mjs` 为数据校验，`lib/store.mjs` 为多行程持久化，`lib/ai.mjs` 为固定提示词和 MiMo 对接，`lib/auth.mjs` 为密码，`lib/updater.mjs` 为更新下载；`launcher.mjs` 负责进程切换与回退；`server.mjs` 提供 API；`public/` 为前后台页面。

封面来自 [Unsplash 大阪城照片](https://unsplash.com/photos/a-tall-white-and-black-building-next-to-a-tree-LTwKfLjYmPQ)，已随镜像打包。地图链接打开 Google Maps，无需 API Key。
