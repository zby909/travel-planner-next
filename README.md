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

生产启动验证：先执行 `npm run build`，再运行 `npm run test:production:smoke`，会自动创建独立测试数据库，检查数据库迁移、初始资料导入、管理员初始化和重启后数据持久化；测试完成会清理临时数据库。GitHub Actions 在构建 Docker 镜像前自动运行这项验证。此测试不等同于 Linux Docker 容器的真实部署验证。

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

## AI / CLI 批量导入：足迹 + 未来想去 + 图片

目前已实现 **Skill + CLI + 限权 API Token**；用户不需要在网站中配置模型 API Key。
CLI 源码在 `cli/`，Agent Skill 在 `skills/travel-import/SKILL.md`。
Token 管理入口是登录后的 `/admin/tokens`，令牌创建后只显示一次，数据库仅保存其 SHA-256 哈希。

### 本地开发安装 CLI（目前尚未发布 npm 或 exe）

```powershell
npm install -g .\cli
travelctl auth login
# CLI 会在本地终端询问网站地址和授权令牌，只需首次设置一次。
# 也可以跳过网站地址提示：travelctl auth login --server https://你的旅行网站域名
travelctl auth status
travelctl visits list
travelctl destinations list
```

`auth login` 在本地终端引导输入网站 URL 和隐藏输入 Token，校验成功后会自动保存两者。Skill 首次使用先检查 `travelctl auth status`，没有配置才引导完成绑定；之后不会每次再问地址和授权码。Windows 配置位于 `%APPDATA%\travelctl\config.json`，Linux/macOS 通常为 `~/.config/travelctl/config.json`；当前使用本地文件而不是操作系统加密钥匙串，请妥善保护。无需将授权令牌发送给 AI。后台 `/admin/tokens` 也提供 CLI / Skill 下载入口及对应网站的登录命令提示。
Node.js 22 及以上版本可直接运行 CLI。建议只发放所需权限，90 天过期；丢失后在网站中撤销。

### 上传配图

```powershell
travelctl media upload .\my-trip.jpg
```

响应包含 `imageId`。第一版支持 JPEG、PNG、WebP，最大上传大小 8 MiB，服务器自动压缩成 WebP 并移除 EXIF/GPS 元信息。文件存放在 Docker 持久化目录 `/app/data/uploads`，数据库只保存图片元数据和引用。图片上传后处于 `STAGED` 状态，**只有经用户确认导入关联到公开足迹或目的地后，图片才会公开**。容器每次启动会清理超过 48 小时、且不被有效导入草稿引用的未公开图片；公开使用中的图片绝不会由该任务删除。也可以运行 `npm run media:cleanup` 手动清理。

请不要自动上传未获授权的他人照片；添加到公开的旅行展示页后图片是可被访客访问的。

### 导入已去过的地方

准备一个 `visits.json`：

```json
{
  "items": [{
    "name": "东京",
    "region": "日本 · 东京",
    "when": "2025-05",
    "group": "mine",
    "country": "日本",
    "latitude": 35.6762,
    "longitude": 139.6503,
    "note": "第一次旅行",
    "imageId": "填入已上传的图片UUID"
  }]
}
```

`imageId` 可省略。年与月的精度应真实可靠；若只有年份，用 `"when":"2025"`；经纬度未知时可以省略，地点会保存但不显示地图点，不能让 AI 猜造坐标。

```powershell
travelctl visits prepare .\visits.json
# 仔细核对草稿、警告和 draftId，明确同意后才提交：
travelctl import commit <draftId> --confirm
```

重复的同名同区域地点不会覆盖现有记录，而是提示并跳过。

### 导入未来旅行计划

`future.json`：

```json
{
  "items": [{
    "title": "京都",
    "subtitle": "日本 · 关西",
    "months": "10–11月",
    "days": "5天",
    "vibe": "秋季红叶",
    "reason": "和朋友看红叶",
    "route": ["京都", "宇治"],
    "spots": ["伏见稻荷大社"],
    "guideDays": [{ "title": "抵达京都", "detail": "办理入住后散步" }],
    "budget": {
      "flight": 2400, "hotel": 1800, "group": 0, "food": 1000,
      "tickets": 500, "transport": 500, "other": 300
    }
  }]
}
```

所有预算字段为人民币**同行人员的总预算**，不是人均。缺少预算就留空，页面显示“待估算”，不会生成虚假的机票报价。也可以填 `imageId` 作为封面。

```powershell
travelctl destinations prepare .\future.json
travelctl import commit <draftId> --confirm
```

接口只在用户确认 `commit` 后才以事务写入数据库，草稿默认 24 小时过期。
`travelctl import cancel <draftId>` 可以放弃草稿。
CLI 适合本地终端和能执行命令的 AI Agent，并非普通聊天网页自动拥有的功能。

### 发布和数据隔离说明

- `cli/package.json` 准备了 `@zby909/travelctl` 的 npm 包，但**尚未发布到 npm**。
- `.github/workflows/cli-release.yml` 会在推送 `v*` 标签时使用 Node.js SEA 构建 Windows x64 exe，并将 EXE 直接添加到 GitHub Release 供下载。此版本**尚未生成正式 EXE**；首次发布必须在 GitHub Actions 中实测。
- `npm run test:import:e2e` 使用临时数据库和临时上传目录，测试 Token、图片私密分段、图片清理元信息、足迹/未来目的地导入与 CLI。
- 现有旧版本使用的个人化 `both/her/mine` 分类以及历史种子数据仍在仓库和镜像中。**项目暂时还不是完全去个人化的空白开源镜像**；需要后续独立迁移旧图片和种子数据，避免破坏已部署用户的数据。
- 第一版只支持每个足迹或目的地一张封面图；暂不支持视频、图片批量相册、自动抓取第三方图片或无人工确认的导入。

## GitHub Actions → GHCR

仓库公开后，每次向 `main` 分支推送代码或手动执行 **Build and publish Docker image** 工作流，会先跑 lint 和生产构建，再构建 `linux/amd64` 镜像并推送到：

```
ghcr.io/<你的 GitHub 用户名>/<仓库名>:latest
```

工作流使用 GitHub 自动提供的 `GITHUB_TOKEN`，不需要在代码仓库中添加 Docker Hub 密码。GHCR 包可能默认为私有；若需要 StackNest 无凭据直接拉取，请在 GitHub 个人主页 → Packages → 对应包 → Package settings → Change visibility 中手动切换为 **Public**，并确认镜像实际构建成功。选择固定的 `sha-xxxxxxx` 标签部署更容易定位版本。
