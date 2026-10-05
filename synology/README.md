# 贝克旅行群晖套件

适用：x86_64 群晖、DSM 7.2.1-69057 或更新版本、Container Manager 1432 或更新版本。该 SPK 通过群晖官方 Docker Project Worker 管理容器，首次安装须能从 GHCR 拉取镜像。SPK 自身不包含旅行数据、数据库和 Cloudflare Tunnel。

在“套件中心 → 手动安装”选择 SPK。安装后使用 DSM 桌面的“贝克旅行”图标，或打开 `http://NAS地址:18080/`。本地 HTTP 访问默认允许登录；如将服务公开到互联网，应使用 HTTPS 反向代理或 Cloudflare Tunnel，并将项目 Compose 中的 `COOKIE_SECURE` 改为 `true`。

数据位于 Docker 具名卷 `beiketrip-data`，源码更新与回退记录位于 `beiketrip-runtime`。升级 SPK 前先备份两个卷。卸载或手动清理 Docker 资源前也应导出数据卷；不要依赖卸载操作保留数据。

从现有服务器迁移时，先停止旧应用并复制整个 `/opt/trip-app/data`。在 NAS 上恢复到 `beiketrip-data` 后再启动套件；`/opt/trip-app/runtime` 可恢复到 `beiketrip-runtime`。旧服务器的 `backup-db` 是单独的 MariaDB 容器，不随 SPK 安装；如果仍需要它的快照历史，须另行迁移数据库。数据中的数据库备份连接设置若仍指向 `backup-db`，应在后台改成新的数据库主机，并验证第一次完整备份成功。

容器运行在 NAS 的 18080 端口，若端口已占用，请在源码 `synology/compose.yaml` 中修改端口并重新构建 SPK；同时修改 `synology/ui/config` 和 `synology/scripts/start-stop-status` 的端口。先检查本地登录、分享、附件与备份，再转移公网域名和 Tunnel，避免旧新服务器同时写入独立数据副本。
