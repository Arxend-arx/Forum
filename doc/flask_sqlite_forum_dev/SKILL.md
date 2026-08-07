---
name: flask_sqlite_forum_dev
description: 基于Python Flask + 原生SQLite3 从零搭建单文件轻量化本地论坛，包含用户、帖子、评论完整业务闭环，自带权限控制、模板渲染、数据持久化，满足教学/本地小型社区基础需求
---

# 技能元信息
skill_id: flask_sqlite_forum_dev
skill_name: 轻量化本地论坛Web系统构建技能
skill_version: 1.0.0
author: FullStack Python Dev
create_time: 2026-07-29
description: 基于Python Flask + 原生SQLite3 从零搭建单文件轻量化本地论坛，包含用户、帖子、评论完整业务闭环，自带权限控制、模板渲染、数据持久化，满足教学/本地小型社区基础需求
tags:
  - python
  - flask
  - sqlite3
  - web论坛
  - 全栈简易项目
  - jinja2模板
  - 本地数据库
compatible_env:
  python_version: ">=3.8"
  os_support: [Windows, Linux, MacOS]
dependencies:
  pip:
    - flask==2.3.3

# 技能核心约束规范
constraint_rules:
  db_limit:
    only_sqlite3: true
    forbid_orm: [sqlalchemy, peewee]
    forbid_external_db: [mysql, postgres, redis]
  code_spec:
    backend_single_file: true # 后端仅app.py单文件
    template_dir: templates/ # 固定模板目录
    use_jinja2_extend: true # 必须使用base.html模板继承
    no_front_framework: true # 禁止Vue/React/Angular
  security_base:
    session_login: true # 使用session存储登录态
    unlogin_intercept: true # 未登录拦截写操作
    owner_only_delete: true # 仅创作者可删帖/删评
    form_empty_check: true # 所有表单非空校验
  data_spec:
    auto_init_table: true # 程序启动自动建库建表
    three_fixed_table: [user, post, comment]
    cascade_delete: true # 删除帖子同步删除关联评论

# 数据库表规范（强制标准）
database_schema:
  table_user:
    fields:
      id: INTEGER PRIMARY KEY AUTOINCREMENT
      username: TEXT NOT NULL UNIQUE
      password: TEXT NOT NULL
      create_time: TEXT NOT NULL
    index: username(唯一索引)
  table_post:
    fields:
      id: INTEGER PRIMARY KEY AUTOINCREMENT
      user_id: INTEGER NOT NULL
      title: TEXT NOT NULL
      content: TEXT NOT NULL
      create_time: TEXT NOT NULL
      update_time: TEXT NOT NULL
    foreign_key: user_id -> user.id
  table_comment:
    fields:
      id: INTEGER PRIMARY KEY AUTOINCREMENT
      post_id: INTEGER NOT NULL
      user_id: INTEGER NOT NULL
      content: TEXT NOT NULL
      create_time: TEXT NOT NULL
    foreign_key:
      post_id -> post.id
      user_id -> user.id

# 强制业务功能清单（技能必须完整实现）
must_have_function:
  user_module:
    - 用户注册：用户名唯一校验、非空校验
    - 用户登录：账号密码匹配、session写入登录信息
    - 退出登录：清空session、跳转首页
    - 登录拦截：未登录禁止发帖/评论/删除操作
  post_module:
    - 首页帖子列表：时间倒序展示、展示作者+时间
    - 发布帖子：标题内容双必填校验
    - 帖子详情页：展示完整正文、关联评论
    - 删除帖子：仅本人可删，级联删除所有评论
  comment_module:
    - 帖子下新增评论：内容非空校验
    - 展示全部评论：按发布时间正序
    - 删除评论：仅评论发布者可删除
  ui_base:
    - 公共基模板base.html：统一导航、消息提示flash弹窗
    - 内置原生CSS，无需外部样式库
    - 所有删除操作增加前端confirm二次确认弹窗

# 项目目录标准结构（技能输出必须遵循）
standard_dir_tree: |
forum_project/
├── app.py               # 后端主程序（单文件）
├── forum.db             # SQLite数据库文件（运行自动生成）
└── templates/           # Jinja2模板目录
    ├── base.html        # 全局公共布局父模板
    ├── index.html       # 论坛首页帖子列表
    ├── login.html       # 用户登录页面
    ├── register.html    # 用户注册页面
    ├── create_post.html # 发帖页面
    └── post_detail.html# 帖子详情+评论页面

# 技能输出规范
output_format:
  step_1: 输出标准目录树
  step_2: 输出完整可运行app.py带详细注释
  step_3: 分文件输出templates下全部HTML源码
  step_4: 输出依赖安装、启动运行命令
  step_5: 输出功能测试验证步骤

# 技能扩展可选功能（按需追加，不破坏基础规范）
optional_extension:
  security_enhance:
    - 密码MD5加密存储
    - XSS内容转义防注入
    - CSRF表单防护
    - 登录session超时失效
  business_extend:
    - 帖子分页
    - 标题全文搜索
    - 帖子编辑功能
    - 评论分页
  ui_extend:
    - Bootstrap5美化页面
    - 帖子点赞功能
    - 帖子分类标签
  advanced:
    - Markdown渲染正文
    - 图片上传存储
    - 管理员后台权限
    - 本地运行日志记录

# 技能调用提示词（配套使用prompt）
skill_prompt: |
调用【flask_sqlite_forum_dev】技能，严格遵循skill文件规范，完成轻量化Python论坛系统开发，要求：
1. 完全遵守数据库三表结构、目录结构、代码约束规则
2. 完整实现所有must_have_function强制基础功能，不可缺失
3. 默认不加载optional_extension扩展功能，如需扩展手动指定
4. 输出严格按照output_format五步标准格式返回完整可运行代码
5. 仅使用Python内置sqlite3与Flask，禁止引入任何ORM、外部数据库服务