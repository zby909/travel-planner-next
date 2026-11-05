# 两个人的旅行手记

**把去过的地方、想去的远方，以及旅途中的小故事，留在同一个地方。**

一个可独立部署、由两个人共同维护的旅行档案应用。它结合旅行足迹地图、目的地心愿清单、行程规划、轻量记账、旅行日记与照片，并提供 AI Skill + CLI 数据导入工具。

[English](README.en.md) · [部署指南](docs/DEPLOYMENT.md) · [开发指南](docs/DEVELOPMENT.md) · [AI / CLI 指南](docs/AI-CLI.md)

> 项目仍在积极开发中，数据结构和交互可能继续调整。欢迎体验和反馈；正式公开发布前，请先阅读本文末尾的隐私、许可证和发布准备说明。

## 项目特色

- **一份共享档案**：每个独立部署拥有自己的数据库和照片，两位成员使用各自账号共同维护。
- **过去与未来**：在地图和时间轴上整理去过的地方，也维护下一站的旅行心愿清单。
- **从规划到回忆**：管理旅行计划、预算、外部 HTML 攻略、四类实际支出，以及按日期整理的旅行日记。
- **照片优先**：支持地点封面和日记多照片；服务端统一压缩为 WebP，并移除 EXIF/GPS 元信息。
- **AI 辅助整理**：通过 travelctl 和 Agent Skill 读取、准备、预览并确认导入旅行数据。
- **可自行部署**：Next.js 应用、SQLite 数据库和照片存储可以一起运行在 Docker 中。

## 功能一览

| 模块 | 能做什么 |
| --- | --- |
| 旅行杂志首页 | 展示旅行心愿、精选目的地和已到访足迹 |
| 目的地心愿清单 | 分类筛选、季节建议、路线、预算和旅行攻略 |
| 足迹地图与时间轴 | 记录地点、成员归属、坐标、照片和旅行事件 |
| 旅行计划 | 管理出行日期、状态、预算和独立 HTML 攻略入口 |
| 旅行花费 | 餐饮、住宿、交通、其它四类；轻量记录实际支出和预算余额 |
| 旅行日记 | 按日期记录标题、文字、到访地点和多张照片 |
| 旅行回忆档案 | 将日记、地点和照片整理成可浏览的年度记录 |
| 双账号与隐私 | 管理员和编辑者共用档案；公开展示或仅成员可见 |
| AI Skill + travelctl | 限权 Token、导入预览、用户确认、图片上传 |
| 备份与恢复 | ZIP 备份、完整性校验、恢复预览和重启后恢复 |

## 页面入口

| 页面 | 路径 | 说明 |
| --- | --- | --- |
| 旅行首页 | `/` | 旅行杂志与未来目的地 |
| 目的地详情 | `/destinations/[id]` | 目的地介绍、预算和攻略 |
| 旅行足迹 | `/visited` | 地图、足迹图录和时间轴 |
| 旅行日记 | `/memories` | 按年份浏览旅行故事和照片 |
| 登录 | `/login` | 成员登录 |
| 管理后台 | `/admin` | 旅行内容和系统管理 |

## 技术栈

- Next.js App Router、React、TypeScript
- Prisma ORM 6、SQLite
- Sharp 图片处理
- Docker / Docker Compose
- GitHub Actions、GitHub Container Registry
- Windows `travelctl.exe` 与 Agent Skill

## 快速开始

### 本地开发

要求 **Node.js 22 或更高版本**。

```powershell
npm ci
Copy-Item .env.example .env
npm run db:deploy
npm run user:create -- owner "管理员" ADMIN
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

- 健康检查：`/api/health`
- 默认数据库：`data/travel.db`
- 默认上传目录：`data/uploads/`

首次创建账号时，终端会要求输入两遍密码，输入不会回显。密码长度为 12–128 位。不要将密码写入命令参数、源码、环境变量模板或聊天记录。

### Docker 部署

```powershell
# 先在本地 .env 中设置一个独立的 BOOTSTRAP_ADMIN_PASSWORD
docker compose up -d --build
docker compose logs -f
```

容器使用 3000 端口，SQLite 和照片保存在挂载到 `/app/data` 的持久化目录。首次启动时，如果配置了 `BOOTSTRAP_ADMIN_PASSWORD`，应用会创建管理员账号；已有账号不会因容器重启而被覆盖。

生产部署必须使用 HTTPS 反向代理。首次登录后建议修改密码，并从部署环境变量中移除初始化密码。StackNest 等平台的具体设置见[部署指南](docs/DEPLOYMENT.md)。

## 两人账号与隐私模式

- 一个站点最多两个登录账号：管理员（ADMIN）和编辑者（EDITOR）。
- 两个账号各自登录，共同维护同一份旅行数据；不开放游客注册。
- 新安装默认**公开展示**旅行首页、足迹、日记和已关联照片；后台始终需要登录。
- 管理员可以切换为**仅成员可见**。私密模式会保护旅行展示页和图片接口，未登录访客需要先登录。
- 旅行计划、预算和外部攻略入口只在登录后台管理，不会因为公开模式而公开未来出行安排。
- 日记和照片遵循站点整体可见性。公开模式下请勿上传不希望被访客看到的内容。

每个部署实例拥有独立 SQLite 数据库和照片目录，适合不同情侣或两人组合分别部署使用。

## AI 与独立 HTML 攻略

旅行攻略可以继续由 AI 生成独立 HTML，再通过 StackNest CLI 等方式部署。本项目只保存攻略访问地址，不托管或代理原始 HTML，也不使用 iframe。

仓库同时提供 Windows `travelctl.exe` 和 [travel-import Agent Skill](skills/travel-import/SKILL.md)，可帮助兼容的本地 Agent 整理足迹、目的地和图片。数据写入采用“准备草稿 → 检查预览 → 用户确认提交”的流程。详见 [AI / CLI 指南](docs/AI-CLI.md)。

## 开发与测试

```powershell
npm ci
npx prisma generate
npm run lint
npm run typecheck
npm run build
```

常用集成测试：

| 命令 | 覆盖内容 |
| --- | --- |
| `npm run test:auth:e2e` | 登录、双账号、权限、旅行计划、记账、日记照片及公开/私密访问；需要本机 Chrome |
| `npm run test:import:e2e` | CLI Token、数据导入和媒体上传 |
| `npm run test:production:smoke` | 空白安装、管理员初始化和重启后数据持久化 |
| `npm run test:backup:restore` | 备份上传、校验和恢复流程 |

测试脚本使用独立临时数据库和上传目录，不应操作真实的 `data/travel.db`。更多约定见[开发指南](docs/DEVELOPMENT.md)。

## 文档

- [开发指南](docs/DEVELOPMENT.md)：项目结构、本地开发、数据库迁移和测试
- [部署指南](docs/DEPLOYMENT.md)：Docker、StackNest、环境变量和生产运行
- [AI / CLI 指南](docs/AI-CLI.md)：travelctl、Agent Skill、Token 和导入示例
- [隐私与安全](docs/PRIVACY-AND-SECURITY.md)：公开/私密模式、图片和数据保护
- [备份与恢复](docs/PRIVATE-BACKUP-RESTORE.md)：ZIP 备份、网页恢复和高级手动恢复
- [贡献指南](CONTRIBUTING.md)：如何提交问题和代码
- [安全问题报告](SECURITY.md)：如何私下报告安全漏洞
- [第三方素材与许可证](docs/THIRD-PARTY-NOTICES.md)：地图、图片和依赖的独立授权说明
- [开源发布检查清单](docs/OPEN-SOURCE-RELEASE-CHECKLIST.md)：正式公开仓库前需要完成的事项

## 开源与许可证

本项目原创代码和项目文档采用 **MIT License**，详见根目录 [LICENSE](LICENSE)。你可以自由使用、复制、修改、合并、发布、分发、再许可和销售软件副本，但需要在软件副本或重要部分中保留版权声明和许可证文本；软件按“现状”提供，不附带任何明示或默示担保。

**许可证范围说明：** MIT 适用于本项目原创代码和文档，不会覆盖或替代第三方依赖、地图数据、照片、字体及其它素材各自的许可证。特别是旧版旅行照片中包含 Wikimedia Commons 素材，部分署名记录标注了 CC BY-SA 3.0 / 4.0；这些素材不能仅凭本项目的 MIT 许可证重新授权。具体情况见[第三方素材与许可证说明](docs/THIRD-PARTY-NOTICES.md)。

维护者已确认历史旅行记录不存在需要因隐私而隐藏的内容。Git 历史中仍保留旧版旅行种子和照片文件；公开仓库前仍需完成第三方图片授权核对、地图数据来源核对及历史凭据扫描。详见[开源发布检查清单](docs/OPEN-SOURCE-RELEASE-CHECKLIST.md)。

## 隐私提醒

旅行照片、日记和地点可能包含个人信息。部署者应取得照片中相关人员的授权，并根据实际需求选择公开或私密模式。公开内容可能被访问、下载或缓存；之后切换为私密模式无法撤回他人此前保存的副本。
