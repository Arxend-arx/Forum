# 论坛系统部署文档（Docker 三容器架构）

## 1. 文档目的

本文档用于指导 AcademicForumLite（前后端分离版）的本地部署、启动、验证与维护。当前项目采用 **Docker Compose 三容器架构**：

- `frontend`：Nginx 托管 React SPA（对外 **8080**），反向代理 `/api` 与 `/uploads` 到后端
- `backend`：Flask REST API（内部 **5000**），连接 PostgreSQL
- `db`：PostgreSQL 16 独立数据库服务（官方镜像，数据卷持久化）

## 2. 部署范围

当前文档覆盖以下内容：

- 运行环境准备（Docker Engine + Compose）
- 项目目录说明
- 一键启动（docker compose）
- 数据库初始化机制
- 本地开发模式（不使用 Docker）
- 功能验证步骤
- 常见问题处理
- 远程部署指引

> 远程服务器部署（含增量更新、数据备份/恢复、SELinux/seccomp 等生产环境细节）详见 [`远程服务更新手册.md`](./远程服务更新手册.md)。

## 3. 运行环境要求

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows / Linux / macOS（Docker Desktop 或 Docker Engine） |
| Docker | Docker Engine ≥ 20.10，含 Compose v2（`docker compose`） |
| 内存 | 建议 ≥ 2GB（三容器运行） |
| 网络 | 首次构建需可拉取基础镜像（`node:20-alpine`、`python:3.12-slim`、`postgres:16-alpine`），如受限可改用国内加速源 |

## 4. 项目目录说明

```text
forum_project/
├── docker-compose.yml        # 三容器编排
├── app.py                    # Flask REST API 后端
├── academic_match.py         # OpenAlex 文献检索 + LLM 分析
├── requirements.txt
├── config.json               # 运行时配置（OpenAlex 免费源，无需密钥）
├── docker/
│   ├── backend/Dockerfile    # 后端镜像
│   └── frontend/             # 前端镜像（Nginx + SPA）
│       ├── Dockerfile
│       └── nginx.conf        # SPA 托管 + /api /uploads 反代 + SSE 关闭缓冲
├── frontend/                 # React + Vite 前端工程（源码）
├── static/uploads/           # 上传图片目录（挂载为上传卷）
├── scripts/                  # 工具脚本（如 SQLite→PG 迁移）
└── deploy/                   # 部署辅助脚本
```

## 5. 一键启动（Docker）

### 5.1 构建并启动

在 `forum_project/` 目录执行：

```bash
docker compose up -d --build
```

### 5.2 访问

浏览器打开：

```text
http://localhost:8080
```

### 5.3 服务与端口

| 服务 | 容器名 | 对外端口 | 说明 |
| --- | --- | --- | --- |
| frontend | `academy-frontend` | 8080 → 容器 80 | Nginx 托管 SPA + 反代 |
| backend | `academy-backend` | 内部 5000（不对外） | Flask API |
| db | `academy-db` | 内部 5432（不对外） | PostgreSQL 16 |

### 5.4 常用命令

```bash
docker compose ps                 # 查看三容器状态
docker compose logs -f backend    # 查看后端日志
docker compose down               # 停止（保留数据卷）
docker compose down -v            # 停止并删除数据卷（会清空数据！）
docker compose up -d --build      # 代码变更后重建
```

## 6. 数据库初始化机制

后端启动时自动执行 `init_db()`（幂等，重复执行安全）：

1. 逐条执行 `CREATE TABLE IF NOT EXISTS` 创建 9 张业务表（user / post / comment / follow / user_llm_config / academic_search / message / friend / friend_request）。
2. 对已有表执行 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 做兼容迁移（avatar / bio / learning_interest / last_active / tags / results_json）。
3. 已存在的数据不会被覆盖。

> PostgreSQL 不允许单条语句包含多个 DDL，`init_db()` 逐条执行。表结构详见 [`database_design.md`](./database_design.md)。

## 7. 本地开发模式（不使用 Docker）

### 7.1 后端

需要本机可访问的 PostgreSQL 实例，通过环境变量配置：

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `PGHOST` | 数据库地址 | `localhost` |
| `PGPORT` | 数据库端口 | `5432` |
| `PGUSER` | 数据库用户 | `academy` |
| `PGPASSWORD` | 数据库密码 | `academy` |
| `PGDATABASE` | 数据库名 | `academy` |
| `UPLOAD_DIR` | 上传目录（可选） | `static/uploads` |

```bash
cd forum_project
pip install -r requirements.txt
python app.py
```

API 默认监听 5000 端口。

### 7.2 前端

```bash
cd forum_project/frontend
npm install
npm run dev          # Vite 开发服务器，代理 /api 到后端
```

开发地址：`http://localhost:5173`。

## 8. 首次部署验证流程

启动完成后，建议按以下步骤验证：

1. 打开 `http://localhost:8080`，确认首页可访问
2. 注册一个测试账号并登录
3. 发布一篇测试帖子（可包含 `#标签`、Markdown、数学公式 `$...$`）
4. 进入帖子详情页发表评论
5. 搜索关键词、按分类/排序筛选帖子
6. 关注其他用户、发送好友请求并接受
7. 好友间发送私信（验证 SSE 实时推送）
8. 使用学术匹配检索（OpenAlex 文献）
9. 上传头像/图片（本地文件选择）
10. 切换中英文、深浅主题
11. 未登录状态下验证发帖/评论被拦截

## 9. 常见问题处理

### 9.1 端口占用

| 现象 | 处理 |
| --- | --- |
| `8080` 被占用 | 修改 `docker-compose.yml` 中 frontend 的 `ports: "8080:80"` 为其他端口 |
| `5000` 被占用（本地非 Docker 开发） | 更换后端启动端口 |

### 9.2 构建拉取基础镜像超时

- 重试，或配置国内镜像加速源
- 前端构建：`docker/frontend/Dockerfile` 已内置 npmmirror / 清华源，失败重试即可

### 9.3 数据持久化

- 数据库数据在命名卷 `pgdata`，删除容器不丢数据
- 上传文件在上传卷 `uploads-data`（backend 挂载 `static/uploads`）
- `docker compose down -v` 会删除数据卷，请勿在生产环境使用

### 9.4 后端连不上数据库

- 检查 `docker compose ps` 中 `academy-db` 是否为 healthy（compose 中 backend 依赖 db 健康检查）
- 检查数据库密码是否与 compose 中 `POSTGRES_PASSWORD` / `PGPASSWORD` 一致

### 9.5 上传/图片 404

- 确认请求路径经 Nginx 反代 `/uploads` → backend
- 确认 backend 挂载了上传卷且 `UPLOAD_DIR` 指向卷内目录

## 10. 远程服务器部署

生产环境部署（`183.239.177.123:15000`）采用与本地相同的三容器架构，但受机房网络限制（无法稳定 `docker pull`、带宽仅几 KB/s），采用「本地构建 → 导出镜像/增量产物 → 上传 → load/增量重建」流程。

详见 [`远程服务更新手册.md`](./远程服务更新手册.md) 与 [`远程部署计划PRD.md`](./远程部署计划PRD.md)。

## 11. 安全说明

- 本版为教学/演示定位：密码明文存储、Flask 签名 Cookie Session，未启用 CSRF/限流
- 生产部署建议：密码改哈希存储、启用 HTTPS、数据库密码更换、限制端口暴露
- 用户自配 LLM Key 仅存于数据库 `user_llm_config`，前端不回显明文

## 12. 文档维护建议

当项目发生以下变化时，应同步更新本部署文档：

- 启动命令 / 端口变化
- 依赖版本变化
- 数据库表结构变化
- 新增环境变量
- 部署方式变化

这样可保证开发、测试、部署各阶段使用同一份准确文档。
