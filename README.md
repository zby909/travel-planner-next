# 下一站 · 私人旅行规划

从原纯静态旅行网站独立迁移出的 Next.js 全栈项目。旧网站与线上正式版保持不变。本仓库默认使用 GitHub Actions 在 `main` 分支构建 Docker 镜像并推送到 GHCR。

## 技术栈

- Next.js App Router + React + TypeScript
- Prisma ORM 6 + SQLite
- Docker / Docker Compose
- 本地持久化数据库：`data/travel.db`
- 本地照片上传目录预留：`data/uploads/`

## 当前已迁移的数据

- 14 个未来目的地及双人预算、平日/节假日机票区间
- 14 份目的地攻略，合计 88 个逐日行程条目
- 31 个已到访/生活足迹地点与 25 条时间轴记录
- 离线地图边界、ECharts、原有照片资源
- 用户提供的广州往返乌鲁木齐机票样本：2026-11-11 至 2026-11-18，两人约 ¥4,000。它作为用户提供的历史查询样本保存，不代表当前可购买报价；航司、直飞和行李条件仍未确认。

原始 JS 数据快照放在 `prisma/seed-data/`，只用于初始导入。数据库模型在 `prisma/schema.prisma`。

## 本地开发

要求 Node.js 22+（当前开发机 Node 24 可用）。

```powershell
npm install
npx prisma migrate deploy
npm run db:seed
npm run user:create -- owner "我" ADMIN
npm run dev
```

打开 `http://localhost:3000`。

健康检查：`http://localhost:3000/api/health`。

公开页：`/`、`/destinations/[id]`、`/visited`。登录页：`/login`。私人后台：`/admin`。

上面的 `user:create` 命令会要求你在终端中输入两遍密码，输入不会回显，也不会输出到日志；密码长度 12—128 位。初始化完成后用管理员账号登录 `/admin/users`，再为王颖创建一位 `EDITOR` 账号。**没有默认密码、没有游客注册入口。**

如不希望通过网页创建第二个账号，也可以分别执行：

```powershell
npm run user:create -- owner "我" ADMIN
npm run user:create -- wangying "王颖" EDITOR
```

**不要把密码写进命令参数、项目源码、环境变量模板或聊天记录。**

安全测试：`npm run test:auth:e2e` 会自动建立独立的 `data/auth-e2e.db`，运行 Chrome 登录、双人权限和修改数据测试，完成后删除测试库，不会碰主库 `data/travel.db`。需要本机安装 Google Chrome。

后台已实现：目的地基础资料与预算拆分修改、机票报价样本新增/删除、足迹地点归属/描述编辑、账号创建、个人密码修改和审计日志。时间轴事件增删、旅游计划/开销/照片上传暂未实现。

## Docker 部署

```powershell
docker compose up -d --build
docker compose logs -f

# 首次管理员账号推荐通过部署平台环境变量自动创建，无需命令行。
```

默认监听本机 3000 端口，可通过环境变量 `PORT` 调整宿主机端口。应用容器内端口固定为 3000。StackNest 部署时映射容器端口 3000，并将持久化目录挂载到 `/app/data`；该目录保存 SQLite 数据库与后续上传的照片。

容器启动时先执行 `prisma migrate deploy`。如果数据库没有初始化标记，就自动导入一次初始种子并保存标记；后续更新容器不会覆盖已编辑的旅行数据。然后检查管理员账号，如尚无账号且配置了 `BOOTSTRAP_ADMIN_PASSWORD`，自动创建第一位管理员。已有账号不会因为环境变量重启而覆盖密码。更新镜像不会主动清空持久化数据。

**StackNest 的 Docker 表单使用 Linux amd64 镜像，容器端口 3000，持久化目录填 `/app/data`，健康检查路径填 `/api/health`。** 平台若提供数据目录挂载，需要确保容器用户（UID 1001）能读写该目录。**首次登录无需进入容器终端。** 在 StackNest 环境变量填写 `BOOTSTRAP_ADMIN_USERNAME=owner`、`BOOTSTRAP_ADMIN_DISPLAY_NAME=管理员` 和你自己生成的高强度 `BOOTSTRAP_ADMIN_PASSWORD`（12—128 位，绝不可放在 GitHub 仓库）。首次启动自动建号；登录 `/admin/account` 修改密码，随后从部署环境变量中移除 `BOOTSTRAP_ADMIN_PASSWORD` 并重启容器。之后在 `/admin/users` 创建王颖账号。生产站点应使用 HTTPS 反向代理。

## 数据模型规划

当前包含目的地、预算、机票价格样本、攻略逐日安排、足迹地点、时间轴、旅行计划、实际支出、回忆和照片元数据等表。

公开页面无需登录；私人后台及所有更改数据库的 Server Actions 都必须验证数据库会话和账号状态。本人可设为管理员，王颖为编辑者，两人均可修改旅行数据，只有管理员能新建账号。SQLite 会保存带盐 scrypt 密码哈希、随机会话 token 的 SHA-256 哈希、登录尝试限制和操作审计记录。后台不提供匿名写入接口。

## 数据安全注意事项

- `data/*.db` 和 `data/uploads/` 是运行时数据，不应提交到 Git。当前生产 Docker 服务通过 HTTPS 反向代理提供登录；生产会话 Cookie 使用 HttpOnly + Secure + SameSite=Strict。
- SQLite 文件必须放在 Docker 持久化挂载目录中。
- 定期备份 `data/travel.db`；有写入时可用 SQLite 在线备份 API 或在应用维护窗口进行一致性备份。
- 不要把数据库文件放进 `public/`。
- 生产环境发布前，需先在 StackNest 预览部署验证数据库卷挂载、健康检查、HTTPS、账号初始化以及重建容器后的数据保留。当前旧静态网站保持不变。
- 登录接口只接受同源 HTML 表单 POST，校验 Origin 与 Host 并限制请求体大小。若 StackNest 反代改写 Host，可以精确设置 `APP_ORIGIN` 为当前公网 origin（例如 `https://travel.example.com`），禁止使用通配域名或允许 `null` Origin。Next.js Server Actions 另有自己的 Origin 检查，部署时仍需实测。
- 后台 `/admin/account` 可修改个人密码，保存后撤销账号的所有旧会话。密码丢失时不使用公开「忘记密码」入口；目前仍可通过容器终端上的运维工具处理。
- Prisma 的 `db:seed` 是旧站数据导入脚本，只在首次部署使用。已有线上编辑数据后，不应手动重复执行，以免旧数据覆盖新编辑内容。

## GitHub Actions → GHCR

仓库公开后，每次向 `main` 分支推送代码或手动执行 **Build and publish Docker image** 工作流，会先跑 lint 和生产构建，再构建 `linux/amd64` 镜像并推送到：

```
ghcr.io/<你的 GitHub 用户名>/<仓库名>:latest
```

工作流使用 GitHub 自动提供的 `GITHUB_TOKEN`，不需要在代码仓库中添加 Docker Hub 密码。GHCR 包可能默认为私有；若需要 StackNest 无凭据直接拉取，请在 GitHub 个人主页 → Packages → 对应包 → Package settings → Change visibility 中手动切换为 **Public**，并确认镜像实际构建成功。选择固定的 `sha-xxxxxxx` 标签部署更容易定位版本。
