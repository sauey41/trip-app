# Amsterdam to Paris · 旅行网站

按参考图制作的响应式旅行手册：六天日期切换、双语时间线、预订清单、地点导航和票券清单。默认显示 10 月 5 日；所有计划均为示例，未虚构真实预订或票券。

## 本地运行

需要 Node.js 22 或更新版本，无第三方运行依赖。

```sh
node server.mjs
node --test
```

打开 http://localhost:8080 。可用 `PORT` 环境变量更改监听端口。

## Docker 部署

推送到 main 后，GitHub Actions 测试并构建 linux/amd64、linux/arm64 镜像，发布至 GHCR：

```sh
docker run -d --name trip-app --restart unless-stopped -p 8080:8080 ghcr.io/sauey41/trip-app:latest
```

也可使用 `docker compose up -d`，或本地构建 `docker compose up -d --build`。健康检查路径为 `/healthz`。任何支持 Linux Docker 容器的平台均可部署，容器内使用非 root 用户，不需要数据库或写入磁盘。

工作流使用 GitHub 自带的 GITHUB_TOKEN，无需 Docker Hub 密钥。首次发布的 GHCR 包可能默认私有；需要匿名拉取时，在 GitHub 包设置中改为 Public。私有包先通过具有 read:packages 权限的凭据登录 ghcr.io。网站本身没有登录鉴权，请勿把真实证件号、订单二维码等敏感资料放进公开版本。

## 修改旅行内容

- `public/data.js`：日期、城市、每日景点、时间和地图关键词。
- `public/app.js`：预订/票券示例清单与页面交互。
- `public/index.html`：旅行标题、年份、简介。
- `public/style.css`：配色和响应式样式。

当前为静态展示网站，无后台编辑、真实出票或跨设备数据同步。地图按钮打开 Google Maps，不需要 API Key。

## 图片来源

封面：John Towner / Unsplash，https://unsplash.com/photos/eiffel-tower-paris-PM4VZZn-YyM 。图片已打包在 public/assets/paris.jpg，运行时不依赖外部图片服务。
