# 贝克旅行 · 旅行手册与编辑后台

前台 `/`，后台 `/admin`。管理每日行程、交通备选路线、酒店与航班、票券附件、出行清单及攻略笔记。支持新增、编辑、排序、复制、删除和 JSON 导入导出；保存后刷新前台可见。

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
- Node.js、系统依赖、启动器协议或第三方包变化需要更新 Docker 镜像；当前更新协议只接受 `runtimeApiVersion: 1`、无第三方依赖的版本。
- 需要容器能通过 HTTPS 访问 GitHub。下载或测试失败保留当前代码。

源码更新只负责应用代码，不自动迁移数据格式。未来涉及破坏性数据迁移时应先完整备份并使用相应镜像版本。运行卷保留历史版本与失败的下载，长期使用可在停机备份后清理不用的目录。

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

- `trip.json`：当前行程与版本号。
- `trip.previous.json`：前一次保存。
- `auth.json`：管理密码哈希。
- `attachments/`：PDF / PNG / JPG 凭证，每个上传最大 12 MB。

后台备份 JSON 不含密码和附件；完整备份请保存整个 `/app/data`。更新镜像或源码均需保留数据卷。不要使用 `docker compose down -v`，它会删除数据卷。

文件保存采用串行写入、原子替换与版本冲突检查。一个数据卷仅由一个应用进程写入，不支持多个副本共享写入。会话有效期 12 小时，退出或服务重启后失效。移除附件关联不会自动删除物理文件，方便恢复。

忘记密码时，由服务器管理员停止应用并备份 `/app/data/auth.json`，再移走该文件，重新启动后在管理页设置新密码。不要在应用运行时直接编辑密码文件。

## 本地运行与测试

Node.js 22+，源码更新还需要 Git。无第三方 Node 依赖。

```sh
node launcher.mjs
node --test
```

默认端口 `8080`。`PORT`、`DATA_DIR`、`RUNTIME_DIR` 可选；未设置时使用本地 `data/` 和 `runtime/`。健康检查为 `/healthz`。仅运行 `node server.mjs` 也能使用编辑功能，但源码更新入口不可用。

测试覆盖首次密码初始化、重复初始化竞争、密码哈希持久化、登录限流、CSRF、附件鉴权、版本冲突、重启持久化、非法导入、HTML 转义、新版本切换和自动回退。CI 还检查只读容器挂载数据卷后的实际登录与保存。

这是一个共享密码、单份旅行的系统。首次 PDF 由人工整理，后续导入支持本系统 JSON，不是任意 PDF 自动识别服务。

## 源码结构

`lib/model.mjs` 为数据校验，`lib/store.mjs` 为持久化，`lib/auth.mjs` 为密码，`lib/updater.mjs` 为更新下载；`launcher.mjs` 负责进程切换与回退；`server.mjs` 提供 API；`public/` 为前后台页面。

封面来自 [Unsplash 大阪城照片](https://unsplash.com/photos/a-tall-white-and-black-building-next-to-a-tree-LTwKfLjYmPQ)，已随镜像打包。地图链接打开 Google Maps，无需 API Key。
