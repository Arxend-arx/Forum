---
name: academic_forum_dev
description: 基于 React + Vite 前端、Flask REST API 后端、PostgreSQL 16 数据库的 AcademicForumLite 论坛开发技能，采用 Docker 三容器（frontend/backend/db）架构部署，包含用户、帖子、评论、关注、好友、私信（SSE）、学术匹配（OpenAlex 文献）完整业务闭环
---

# 技能元信息
skill_id: academic_forum_dev
skill_name: 学术论坛全栈开发技能（前后端分离 + Docker 三容器）
skill_version: 1.0.0
author: FullStack Python Dev
create_time: 2026-08-15
description: 基于 React + Vite 前端、Flask REST API 后端、PostgreSQL 16 数据库的 AcademicForumLite 论坛开发技能，采用 Docker 三容器（frontend/backend/db）架构部署，包含用户、帖子、评论、关注、好友、私信（SSE）、学术匹配（OpenAlex 文献）完整业务闭环
tags:
  - react
  - vite
  - flask
  - postgresql
  - docker
  - 前后端分离
  - 学术论坛
  - sse实时聊天
compatible_env:
  python_version: ">=3.10"
  node_version: ">=18"
  os_support: [Windows, Linux, MacOS]
dependencies:
  pip:
    - flask
    - psycopg2-binary
    - requests
  npm:
    - react
    - react-dom
    - react-router-dom
    - react-i18next
    - i18next
    - katex
    - vite

# 技能核心约束规范
constraint_rules:
  architecture:
    front_back_separated: true # 前后端分离：Flask 仅提供 /api/* REST JSON，前端为独立 React 工程
    three_container: true      # Docker 三容器：frontend(Nginx SPA) / backend(Flask API) / db(PostgreSQL 16)
    db_service: postgresql     # 数据库为独立容器服务，非文件数据库
  code_spec:
    backend_api_only: true     # 后端不渲染 HTML 模板（render_template 禁用）
    frontend_dir: frontend/    # React 源码目录
    use_orm: false             # 不使用 ORM，原生 SQL 参数化（psycopg2）
  security_base:
    session_login: true        # Flask 签名 Cookie Session 存储登录态
    unlogin_intercept: true    # 未登录拦截写操作
    owner_only_delete: true    # 仅创作者可删帖/删评
    form_empty_check: true     # 所有表单非空校验
  data_spec:
    auto_init_table: true      # 后端启动 init_db() 幂等建表 + ADD COLUMN 兼容迁移
    cascade_delete: true       # 删除帖子同步删除关联评论（ON DELETE CASCADE）

# 数据库表规范（PostgreSQL 语法）
database_schema:
  table_user:
    fields:
      id: SERIAL PRIMARY KEY
      username: TEXT NOT NULL UNIQUE
      password: TEXT NOT NULL
      create_time: TEXT NOT NULL
    extra_columns: [avatar, bio, learning_interest, last_active] # 兼容迁移列
  table_post:
    fields:
      id: SERIAL PRIMARY KEY
      user_id: INTEGER NOT NULL REFERENCES "user"(id)
      title: TEXT NOT NULL
      content: TEXT NOT NULL
      create_time: TEXT NOT NULL
      update_time: TEXT NOT NULL
    extra_columns: [tags] # #标签 逗号分隔
  table_comment:
    fields:
      id: SERIAL PRIMARY KEY
      post_id: INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE
      user_id: INTEGER NOT NULL REFERENCES "user"(id)
      content: TEXT NOT NULL
      create_time: TEXT NOT NULL
  table_follow:        # 关注关系
  table_user_llm_config: # 用户自配 LLM（base_url/api_key/model）
  table_academic_search: # 学术匹配检索记录
  table_message:         # 私信(private)/系统通知(system)
  table_friend:          # 好友关系
  table_friend_request:  # 好友请求(pending/accepted/rejected)

# 强制业务功能清单（技能必须完整实现）
must_have_function:
  user_module:
    - 注册：用户名唯一校验、非空校验
    - 登录：账号密码匹配、session 写入登录态
    - 退出登录：清空 session
    - 登录拦截：未登录禁止发帖/评论/私信等写操作
    - 在线状态：last_active 心跳刷新，2 分钟内有活跃视为在线
  post_module:
    - 帖子列表：最新/最热排序、#标签分类筛选
    - 发布帖子：Markdown 正文（KaTeX 公式、GFM 表格）、提取 #标签 写入 tags
    - 帖子详情：Markdown 渲染 + 评论列表
    - 删除帖子：仅作者可删，级联删除评论
  comment_module:
    - 帖子下新增评论：Markdown 编辑器（含表情选择器、图片上传）
    - 删除评论：仅评论作者可删
  social_module:
    - 关注 / 取消关注
    - 好友请求 → 接受/拒绝 → 建立好友关系
    - 私信聊天（仅好友间），SSE 服务端实时推送
    - 系统通知（@提及、好友请求），未读徽标
  search_module:
    - 关键词搜索（帖子标题/正文 + 用户）
  academic_match_module:
    - OpenAlex 免费文献检索（无需 Key）
    - 用户自配 OpenAI 兼容 LLM 生成匹配分析
    - 检索历史持久化
  ui_base:
    - 中英双语 i18n（react-i18next）
    - 浅色/深色主题（CSS Variables）
    - 统一设计令牌、加载态/空态/Toast/确认弹窗

# 项目目录标准结构（技能输出必须遵循）
standard_dir_tree: |
forum_project/
├── docker-compose.yml        # 三容器编排（frontend:8080 / backend:5000 / db:5432）
├── app.py                    # Flask REST API 后端（唯一入口，含 init_db）
├── academic_match.py         # OpenAlex 文献检索 + LLM 分析 + save_search
├── config.json               # 运行时配置（OpenAlex 免费源，无需密钥）
├── requirements.txt
├── docker/
│   ├── backend/Dockerfile
│   └── frontend/             # Nginx SPA + /api /uploads 反代 + SSE 关缓冲
│       ├── Dockerfile
│       └── nginx.conf
├── frontend/                 # React + Vite 工程
│   ├── vite.config.js        # dev 代理 /api
│   └── src/
│       ├── App.jsx           # 路由 + 全局 Provider
│       ├── main.jsx
│       ├── api/client.js     # fetch 封装（携带凭据、统一错误）
│       ├── i18n/             # react-i18next 配置 + zh/en
│       ├── context/          # AppContext（当前用户/语言/主题）
│       ├── components/       # Layout、Markdown、MarkdownEditor、PostCard、TagChips、EmojiPicker...
│       ├── pages/            # Home/CreatePost/PostDetail/Profile/Search/Chat/Messages/Friends/Match...
│       └── styles/theme.css  # 设计令牌 + 深浅主题
├── static/uploads/           # 上传图片（挂载上传卷）
└── scripts/                  # 工具脚本（如 migrate_sqlite_to_pg.py）

# 技能输出规范
output_format:
  step_1: 输出标准目录树
  step_2: 输出后端 app.py（REST API + init_db）+ academic_match.py
  step_3: 输出前端 React 工程（页面/组件/路由/i18n/主题）
  step_4: 输出 docker-compose.yml 与 Dockerfile/nginx.conf
  step_5: 输出依赖安装、构建、启动、验证步骤

# 技能扩展可选功能（按需追加，不破坏基础规范）
optional_extension:
  security_enhance:
    - 密码哈希存储（werkzeug.security / bcrypt）
    - XSS 内容转义
    - CSRF 防护
  business_extend:
    - 帖子点赞/收藏
    - 帖子编辑
    - 分页/惰性加载
  deploy_enhance:
    - 远程服务器增量部署（dist/源码增量更新）
    - 数据库备份恢复（pg_dump）
    - HTTPS/域名

# 技能调用提示词（配套使用prompt）
skill_prompt: |
调用【academic_forum_dev】技能，严格遵循skill文件规范，开发或维护 AcademicForumLite 学术论坛系统，要求：
1. 完全遵守前后端分离、三容器 Docker、PostgreSQL 架构约束
2. 后端仅提供 /api/* REST JSON，不渲染模板；原生 SQL 参数化
3. 完整实现 must_have_function 强制基础功能，不可缺失
4. 前端遵循 frontend/ 目录结构，支持 i18n 与深浅主题
5. 输出严格按照 output_format 五步标准格式返回完整可运行代码
