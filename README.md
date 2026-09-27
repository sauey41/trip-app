# 贝克旅行 · 私人旅行手册与编辑后台

响应式旅行网站，保留深绿、米白与橙色的原参考风格。前台与后台读取同一份持久数据，后台保存后刷新前台即可查看更新。

## 功能

- `/`：每日行程时间线、交通路线与 Plan B、地图导航、预订、票券、出行清单与攻略笔记。
- `/admin`：旅行封面与日期编辑；每日安排、预订、票券、清单、笔记的新增、修改、复制、排序及删除。
- 酒店确认单、车票等 PDF / PNG / JPG 附件上传下载（每个最大 12 MB）。
- JSON 导入导出、保存前确认、未保存离开提醒、多设备修改冲突保护。
- 密码登录，前台数据和附件也需要登录。会话有效期 12 小时，重启或退出后失效。

支持一份旅行手册、一个共享管理密码；没有多账户权限分级。第一次 PDF 已由人工整理，后台的导入功能支持系统 JSON 备份，**不是任意 PDF 自动识别服务**。

## 快速部署

GitHub Actions 在推送 main 后测试并发布 `linux/amd64`、`linux/arm64`：

```sh
ghcr.io/sauey41/trip-app:latest
```

复制 `.env.example` 为 `.env`，设置自己选择的、至少 12 位的 `ADMIN_PASSWORD`。不要把密码提交到 Git。

```dotenv
ADMIN_PASSWORD=请替换为你自己的长密码
COOKIE_SECURE=false
```

```sh
docker compose pull
docker compose up -d
```

打开 `http://服务器IP:8080/admin`，使用上述密码登录。默认新部署为空旅行，可在后台新增内容或导入私有 JSON 备份。

也可以独立运行：

```sh
docker run -d --name trip-app --restart unless-stopped \
  --env-file .env \
  -p 8080:8080 \
  -v trip-data:/app/data \
  ghcr.io/sauey41/trip-app:latest
```

`ADMIN_PASSWORD` 没有默认值，未配置或少于 12 位时不会开放数据接口。HTTPS 反向代理后设置 `COOKIE_SECURE=true`；本地纯 HTTP 保持 false。反向代理需保留请求 Host，允许至少 12 MB 请求体。远程部署建议用 HTTPS 保护登录密码与私人行程。

若 GHCR 包为私有，先使用有 `read:packages` 权限的凭据登录 `ghcr.io`，或由仓库所有者将镜像包设为公开。镜像内不包含私人行程与附件。

## 迁移大阪 / 神户私有行程

私人行程、确认号及酒店凭证只保存在独立交付的数据包中，**没有提交到本仓库，也没有打入公开镜像**。

两种迁移方式：

1. **只导入行程**：登录后台 → 备份与迁移 → 导入交付的 JSON → 检查 → 保存。JSON 里只有附件关联信息，不含附件本身；可以在预订页面重新上传附件。
2. **完整迁移**：把私有数据 ZIP 解压到 `trip-data` 文件夹，确保其中直接包含 `trip.json` 和 `attachments/`。在服务器首次部署后、开始编辑前执行：

```sh
docker compose cp ./trip-data/. trip:/app/data
docker compose exec --user root trip chown -R node:node /app/data
docker compose restart trip
```

这会替换现有数据，请仅用于首次初始化，或先备份现有数据。随后使用服务器 `.env` 中的密码登录。私有数据包和密码文件应妥善保存，不要加入 Git。

## 数据持久化与备份

- `/app/data/trip.json`：完整行程及保存版本号。
- `/app/data/trip.previous.json`：上一个保存版本。
- `/app/data/attachments/`：私有附件。

保存采用串行写入、临时文件原子替换；旧版本提交返回冲突，不会静默覆盖另一设备的修改。数据文件不可写、磁盘满或数据损坏会显示错误。需要一个 Node 进程对应一个数据卷，不支持多个容器同时写同一数据目录。

升级用 `docker compose pull && docker compose up -d`。不要执行带 `-v` 的 down 命令，否则会删除数据卷。仅导出 JSON 不包含附件；完整备份请在停止编辑时备份整个数据卷。

附件解除关联不会自动删除物理文件，方便恢复；旧附件可在做好备份后由管理员清理。HTML 及 SVG 不作为票券附件接受，PDF / 图片下载需要有效登录。

## 本地开发

Node.js 22+，无第三方运行依赖：

```sh
node --env-file=.env server.mjs
node --test
```

默认端口 `8080`，可通过 `PORT` 更改；数据目录默认 `./data`，可通过 `DATA_DIR` 更改。健康检查 `/healthz`。

测试覆盖登录、限流、CSRF、非公开文件隔离、并发保存、重启持久化、备份、非法导入、附件鉴权和 HTML 转义。前台和后台模板均对用户输入转义，参考链接只接受 HTTP/HTTPS。

## 文件结构

- `lib/model.mjs`：行程数据结构与校验。
- `lib/store.mjs`：持久数据与版本冲突保护。
- `server.mjs`：API、会话、附件与静态资源。
- `public/admin.js`、`admin.css`：后台编辑页面。
- `public/app.js`、`style.css`：旅行前台。

封面图片来自 [Unsplash 大阪城照片](https://unsplash.com/photos/a-tall-white-and-black-building-next-to-a-tree-LTwKfLjYmPQ)，已随镜像打包。地图链接打开 Google Maps，无需 API Key。
