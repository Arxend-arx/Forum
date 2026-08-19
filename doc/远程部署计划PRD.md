# 远程服务器部署计划 · PRD

| 项目 | 内容 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-08-07 |
| 状态 | 待评审（尚未开始执行） |
| 目标服务器 | 183.239.177.123 |
| 待部署项目 | Academy Forum（前端 Nginx + 后端 Flask + PostgreSQL 数据库，三容器架构） |

---

## 1. 背景与目标

本地已完成 Academy Forum 的前后端分离重构与 **三容器 Docker 部署**（frontend / backend / db），镜像已构建验证通过。现需将这套已就绪的容器化应用**投放至远程服务器 183.239.177.123**，使应用可在公网访问。

**已知约束**：服务器当前账号**没有 docker 命令**（需先解决 Docker 安装或账号权限问题）。

## 2. 部署目标形态（与本地一致）

```
公网/用户 ──► :8080  academy-frontend（Nginx 托管 SPA + 反代 /api /uploads）
                        │
                        ▼
                  academy-backend（Flask REST API，内部 5000）
                        │ 共享数据卷
                        ▼
                  academy-db（PostgreSQL 16 独立数据库服务）
数据持久化：PostgreSQL 数据卷（pgdata）+ 上传文件卷（uploads-data）
```

## 3. 前置条件（关键）

| 项 | 现状 | 需要确认/解决 |
|---|---|---|
| Docker | 服务器无 docker 命令 | 安装 Docker Engine + Compose 插件，或给当前账号授权（docker 组 / sudo） |
| SSH 访问 | 未知 | 需要：用户名、认证方式（密码/密钥）、端口 |
| 操作系统 | 未知 | 需要确认发行版（Ubuntu / Debian / CentOS 等）以选择安装方式与国内镜像源 |
| 权限 | 未知 | 是否有 root 或 sudo |
| 网络 | 未知 | 服务器到外网（拉取基础镜像）与到 Docker Hub 的连通性；必要时配置国内加速源 |
| 端口 | 未知 | 服务器防火墙/安全组需放行对外端口（默认计划 8080，可改 80） |
| 数据 | 本地存量数据（SQLite forum.db + uploads） | 经 `scripts/migrate_sqlite_to_pg.py` 迁移入 PostgreSQL，uploads 复制到上传卷 |
| 配置 | config.json 含智慧芽 MCP Key | 随镜像或环境变量带入（注意密钥安全） |

## 4. 部署方案选型

### 4.1 Docker 安装（服务器侧，先行项）
- 目标：让目标账号可用 `docker` / `docker compose` 命令。
- 方式（按优先级）：
  1. **官方脚本**：`curl -fsSL https://get.docker.com | sh`（Ubuntu/Debian/CentOS 通用）
  2. 系统包管理器安装（apt/dnf/yum），并配置国内镜像加速源
  3. 若账号无 sudo：请服务器管理员执行安装，或为账号加入 `docker` 组
- 验证：`docker version`、`docker compose version` 可用。

### 4.2 应用代码/镜像传输方式（选其一）
| 方案 | 说明 | 适用 |
|---|---|---|
| **A. 源码 + 服务器构建** | 将 Forum_test 项目（或 forum_project 子集）git clone / scp 到服务器，服务器执行 `docker compose up -d --build` | 服务器网络可拉基础镜像（推荐，简单可靠） |
| B. 镜像导出导入 | 本地 `docker save` 三个镜像 → scp → 服务器 `docker load` | 服务器拉取镜像受限时（离线部署） |
| C. 推送到镜像仓库 | 本地 push 到 Docker Hub / 私有 registry，服务器 pull | 有可用仓库且服务器可达 |

> 推荐 **方案 A**：代码已在 GitHub（Forum_test 仓库），服务器 `git clone` + `docker compose up -d --build` 即可，与本地构建链路完全一致（含国内加速源配置，Dockerfile 已内置 `docker.1ms.run` / `hub.rat.dev` 与 npmmirror / 清华 pip 源）。

### 4.3 数据迁移
- 先在服务器拉起 PostgreSQL（compose db 服务，postgres:16-alpine，卷持久化），再执行 `scripts/migrate_sqlite_to_pg.py` 将本地 SQLite 存量数据（用户/帖子/评论/匹配历史等）迁入；uploads 目录复制到 backend 上传卷。
- 存量数据保留：test01 等账号与帖子需完整迁移（scp/rsync 传输 data 目录）。

### 4.4 访问与端口
- 对外暴露端口默认 **8080**（与本地一致）；如需 80 端口直接访问，可调整 compose `ports: "80:80"`。
- 服务器安全组/防火墙放行对应端口。
- 域名/HTTPS：本期按用户此前决定**不配置**（如需，后续再议）。

### 4.5 密钥与配置安全
- config.json（智慧芽 MCP Key）随代码/镜像进入服务器；若担心泄露，改为环境变量 `PAT_SNAP_MCP_KEY` 注入。
- 服务器 SSH 建议使用密钥认证；不提交任何密码到仓库。

## 5. 执行步骤（里程碑）

| 阶段 | 任务 | 产出/验收 |
|---|---|---|
| M1 信息收集 | 确认 SSH 用户/认证/端口、系统版本、sudo 权限、开放端口 | 部署所需全部参数 |
| M2 Docker 就绪 | 服务器安装 Docker + Compose，配置国内加速源，账号可用 | `docker version` 通过 |
| M3 代码上服务器 | git clone 或 scp Forum_test 到服务器 | 项目目录就绪 |
| M4 数据迁移 | 服务器拉起 PostgreSQL；执行 SQLite→PG 迁移脚本 + uploads 复制 | 数据完整校验（用户/帖子/历史条数一致） |
| M5 构建启动 | 服务器 `docker compose up -d --build` | 三容器 Up |
| M6 联调验收 | 公网访问 health/首页/登录/帖子/上传 | 与本地功能一致 |
| M7 配置安全 | 关闭调试、密钥改环境变量、防火墙收口 | 安全加固 |
| M8 文档与回滚 | 记录部署命令；保留回滚方案（旧容器/旧数据备份） | 部署手册 |

## 6. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 服务器无 sudo 无法装 Docker | M2 阻塞 | 联系管理员安装 / 使用免 root 的 rootless Docker |
| 服务器拉取基础镜像失败（境外源受限） | M5 阻塞 | 复用 Dockerfile 内置国内加速源；或方案 B（docker save/load 离线） |
| 存量数据丢失/损坏 | 数据完整性 | 迁移前本地备份；迁移后校验帖子数/用户数 |
| 8080 端口被占用或未放行 | 无法访问 | 端口探测；调整映射或改 80 |
| config.json 密钥泄露 | 安全 | 改环境变量注入；服务器权限最小化 |

## 7. 待确认信息（阻塞项，需用户/管理员提供）

**已确认：**
- [x] SSH 登录方式：用户名 + 密码
- [x] 服务器权限：账号**有 sudo**（可自行安装 Docker）

**待确认（需要你提供或首次登录后确认）：**
- [ ] **SSH 用户名与密码**（部署第一步登录使用，尚未提供）
- [ ] SSH 端口（默认 22？）
- [ ] 操作系统发行版与版本（登录后 `cat /etc/os-release` 确认，以选择 Docker 安装方式与源）
- [ ] 服务器防火墙/安全组是否放行对外端口（未定，默认计划 8080，也可改 80）
- [ ] 对外访问方式：IP:8080 直接访问（未定，登录后确认）

> **注**：本 PRD 仅为计划，所有部署动作待 SSH 凭据提供与本 PRD 评审通过后执行。
> **待办**：`ssh <user>@183.239.177.123` 登录后先执行 `cat /etc/os-release`、`ss -tlnp`、`id` 确认系统/端口/权限，再进入 M2（安装 Docker）。
