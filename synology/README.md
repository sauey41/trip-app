# 贝克旅行原生群晖套件

适用：DSM 7.2 或更新版本、x86_64 机型。套件依赖群晖官方 **Node.js v22** 和 **Git Server**，不使用 Docker / Container Manager。SPK 内含网站代码和 JavaScript 运行依赖，不含旅行数据、数据库或 Cloudflare Tunnel。

在“套件中心”先安装 Node.js v22 和 Git Server，然后“手动安装” `BeikeTrip-*-DSM7.2-native.spk`。安装后从 DSM 桌面打开“贝克旅行”，或访问 `http://NAS地址:18081/`。安装、升级、启动和停止由 DSM 套件中心管理。首次打开后台 `/admin` 时按页面提示建立管理员账号；无需在套件中写密码。

数据保存在 `/var/packages/BeikeTrip/var/data/`，源码更新与回退记录保存在 `/var/packages/BeikeTrip/var/runtime/`。这两个目录在套件升级时保留。安装包和源代码不包含这些数据。迁移或卸载前，先停止套件并完整备份 `var` 目录；尤其不要只复制旅行 JSON 而遗漏对话、图片、附件、语音、账户和密钥文件。旧服务 `/opt/trip-app/data/` 的内容应复制到新套件的 `var/data/`，并确保 `beiketrip` 套件用户可以读取和写入。复制完毕再启动新套件，检查账户、行程、分享、AI 对话和附件。旧新服务器不要同时写入独立的数据副本。

登录用户名在这套网站内唯一；「个人资料」中的显示名称可以自行修改、允许重名。套件升级保留原账号编号及内容，不需要重新注册。若 NAS 与旧服务器各自有一份数据，同名账号也属于两个独立站点；迁移时请恢复旧站完整数据目录，不会按用户名自动合并。

网站的 MySQL / MariaDB 备份功能仍可连接 NAS 或外部数据库，但数据库服务和历史快照不包含在 SPK 中。旧备份连接若填写了 Docker 内部主机名 `backup-db`，迁移后须在后台改为实际可达的 NAS 数据库地址，再测试连接和完整备份。

后台“系统更新”通过 Git Server 的 `git` 命令从 GitHub 拉取源码，需要 NAS 能访问 GitHub。依赖版本改变时应安装新 SPK；仅源码变更才适合后台更新。套件默认不含浏览器可执行文件；飞书公开页面自动读取若需浏览器，可在 NAS 安装兼容的 Chromium，把可执行文件的绝对路径写入 `/var/packages/BeikeTrip/var/chromium-path` 后重启套件。手动粘贴正文和文件导入不需要浏览器。

默认 HTTP 端口为 18081。公网应通过 HTTPS 反向代理或 Cloudflare Tunnel 访问。原有 Tunnel 与 1Panel 不随 SPK 迁移，转移域名之前应先在 NAS 局域网测试登录与附件。若 NAS 已占用 18081 端口，应在源码中同步修改套件启动脚本、DSM 快捷方式配置和 INFO 后重新打包。
