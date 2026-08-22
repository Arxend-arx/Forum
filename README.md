# Polarium — 学术社区论坛

一个面向学者/学生的学术交流社区，融合 **星空主题交互**、**学术内容匹配**、**论文发布** 与 **实时社交**。前端采用 React SPA，后端 Flask，数据库 PostgreSQL，以 Docker Compose 三容器部署。

## 功能特性

### 星空与匹配
- **Polestars 北极星**：基于 Stellarium WebGL 引擎的真实星空（WASM + Canvas）。每个用户按个人画像（学习意向/签名等）投影为天球上的一颗星，在线/离线、星数与匹配热度实时可见；搜索关键词可对全站用户做语义匹配，命中用户连成星座
- **星点亮度/大小随集星数变化**：用户在平台上的活跃度（发帖、被关注、绑定邮箱、发论文）越多，星越亮越大

### 成长记录（集星瓶）
- 注册 +1 星、**每次发帖 +1 星、每次被关注 +1 星**、绑定学术邮箱 +2 星、发布首篇论文 +3 星
- Profile 页动态集星瓶：打开时播放「未展示的累计加分」动画，新增 ≤3 颗逐个飞入，>3 颗统一展示 3 星动效后更新总数

### 内容社区（Social）
- Reddit 式三栏布局：左栏（热门/资讯/探索 + 标签）、中栏信息流、右栏好友列表（前 6 位 + 全部好友页）
- 帖子内联详情/搜索/发帖，不跳页；支持 Markdown、公式（KaTeX）、图片与视频
- **资讯（News）** 按热度、标签命中、社交关系等综合评分推送

### 学术身份与论文（Articles）
- **学术邮箱绑定**：6 位验证码（SMTP 或日志兜底），每邮箱仅可绑定一个账号
- **论文发布**：输入 DOI → 调用 OpenAlex 提取元数据 → 校验作者邮箱与绑定邮箱一致后方可发布到自己的 Articles 栏

### 社交与私信
- 好友请求：发送到对方**信件箱**，信件箱内可直接**接受/拒绝**，双向好友列表即时更新
- **私信**：SSE 实时推送，消息即时到达；信件箱未读数以徽标展示，进入信件箱即清空未读
- Landing 左下角圆形信件箱入口，带未读角标

### 其他
- 中 / 英 双语（i18next）、亮 / 暗主题切换
- 全站统一顶部导航：Home / Starlink / Polestars / Profile / Manage（管理员）
- 管理员公告、用户关注/粉丝、大模型学术匹配分析（OpenAI 兼容接口）

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 · Vite 5 · React Router 6 · i18next · KaTeX · Tailwind 4 |
| 后端 | Flask 2.3 · requests · psycopg2（PostgreSQL） |
| 数据库 | PostgreSQL 16（官方镜像） |
| 部署 | Docker Compose 三容器：Nginx(SPA) + Flask(API) + PostgreSQL |
| 外部服务 | OpenAlex（DOI 元数据）、SMTP（邮件验证码）、OpenAI 兼容 LLM（可选） |

## 项目结构

```
forum_project/
├── app.py                 # Flask 后端主入口（路由/API/迁移）
├── starlink.py            # 星空匹配算法（画像向量 + 余弦相似度 + 天球坐标映射）
├── academic_match.py      # OpenAlex 检索 + LLM 匹配分析
├── config.json            # SMTP 配置（学术邮箱验证码）
├── docker-compose.yml     # 生产编排（8080）
├── docker-compose.local.yml  # 本地预览 override（8081，change-* 容器）
├── docker/                # 前后端 Dockerfile 与 nginx.conf
├── frontend/              # React SPA（src/ 源码，dist/ 构建产物）
├── templates/             # 旧版服务端模板（保留，未使用）
└── static/uploads/        # 上传文件
```

## 快速开始

### 本地预览（8081，与主站并行不冲突）

```bash
cd forum_project
docker compose -p change -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

访问 <http://localhost:8081>。容器名前缀 `change-*`（change-frontend / change-backend / change-db），独立数据卷，可与生产环境并行运行。

### 生产部署（8080）

```bash
cd forum_project
docker compose up -d --build
```

访问 <http://localhost:8080>。

### 前端开发

```bash
cd forum_project/frontend
npm install
npm run dev      # Vite 开发服务器（需自行代理 /api 到后端）
npm run build    # 产物输出到 dist/
```

## 配置说明

### SMTP（学术邮箱验证码）

编辑 `config.json`：

```json
{
  "smtp": {
    "host": "smtp.example.com",
    "port": 465,
    "user": "you@example.com",
    "password": "******",
    "from": "you@example.com",
    "use_ssl": true
  }
}
```

`host` 留空时验证码只打印到后端日志（`[EMAIL-DEBUG] ...`），便于本地测试。

### 数据库

PostgreSQL 连接参数通过环境变量注入（`PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE`），表结构由 `app.py` 启动时自动迁移创建。

## 远程部署

服务器无法直接 `docker pull` 时，采用增量镜像构建：`FROM 现有镜像 + COPY 新文件`，然后重建容器。相关部署脚本位于 `deploy_tmp/`（**含服务器凭据，未纳入版本控制**），示例：

```bash
cd deploy_tmp
python deploy_remote.py
```

## 备注

- 前端构建产物 `frontend/dist/` 与本地数据库 `forum.db` 不入库（见 `.gitignore`）
- 旧版 `templates/` 为历史遗留的服务端模板，新版前端已全面接管页面渲染
