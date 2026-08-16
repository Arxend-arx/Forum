# 论坛系统数据库设计文档（PostgreSQL）

## 1. 文档概述

本文档描述 AcademicForumLite（前后端分离版）的数据库设计方案。系统使用 **PostgreSQL 16**（独立数据库容器 `academy-db`），后端通过 `psycopg2` 直连（不使用 ORM），数据库由后端启动时的 `init_db()` 幂等建表并做兼容迁移。

业务表（`app.py` 中 `init_db()` 维护，共 9 张）：

- `user`：用户表
- `post`：帖子表
- `comment`：评论表
- `follow`：关注关系表
- `user_llm_config`：用户 LLM API 配置表
- `academic_search`：学术匹配检索记录表
- `message`：私信 / 系统通知表
- `friend`：好友关系表
- `friend_request`：好友请求表

## 2. 数据库基础信息

| 项目 | 内容 |
| --- | --- |
| 数据库类型 | PostgreSQL 16 |
| 服务形态 | 独立容器（`academy-db`，官方 `postgres:16-alpine` 镜像） |
| 驱动方式 | Python `psycopg2`（`psycopg2.extras.RealDictCursor`） |
| 建库方式 | 后端启动时 `init_db()` 逐条执行 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`（幂等） |
| ORM 使用情况 | 不使用 ORM |
| 连接参数 | 环境变量 `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` |
| 持久化 | 命名卷 `pgdata`（本地 compose）；服务器为 bind mount `~/academy/pgdata` |

## 3. 表结构设计

> 所有 `id` 为 `SERIAL PRIMARY KEY`（自增）；时间字段统一 `TEXT`，格式 `YYYY-MM-DD HH:MM:SS`。

### 3.1 用户表 `user`

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY | 用户主键 |
| `username` | TEXT | NOT NULL, UNIQUE | 用户名，必须唯一 |
| `password` | TEXT | NOT NULL | 用户密码（明文，当前版本教学实现） |
| `create_time` | TEXT | NOT NULL | 用户创建时间 |
| `avatar` | TEXT | NOT NULL DEFAULT '' | 头像 URL（兼容迁移列） |
| `bio` | TEXT | NOT NULL DEFAULT '' | 个人签名（兼容迁移列） |
| `learning_interest` | TEXT | NOT NULL DEFAULT '' | 学习意向（学术匹配用，兼容迁移列） |
| `last_active` | TIMESTAMP | NULL | 最近活跃时间（在线状态，兼容迁移列） |

说明：

- `username` 通过唯一约束防止重复注册。
- 在线状态：`last_active` 由后端 `before_request` 心跳刷新，2 分钟内有活跃视为在线。

### 3.2 帖子表 `post`

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY | 帖子主键 |
| `user_id` | INTEGER | NOT NULL REFERENCES `user`(id) | 发帖用户 ID |
| `title` | TEXT | NOT NULL | 帖子标题 |
| `content` | TEXT | NOT NULL | 帖子正文（Markdown） |
| `create_time` | TEXT | NOT NULL | 创建时间 |
| `update_time` | TEXT | NOT NULL | 更新时间 |
| `tags` | TEXT | NOT NULL DEFAULT '' | `#标签` 逗号分隔（兼容迁移列） |

说明：

- 首页按 `create_time DESC, id DESC` 倒序展示；支持最新/最热排序与分类筛选。
- `tags` 由发帖时正文中 `#标签` 提取，用于分类与搜索。

### 3.3 评论表 `comment`

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY | 评论主键 |
| `post_id` | INTEGER | NOT NULL REFERENCES post(id) ON DELETE CASCADE | 所属帖子 ID |
| `user_id` | INTEGER | NOT NULL REFERENCES `user`(id) | 评论用户 ID |
| `content` | TEXT | NOT NULL | 评论内容（Markdown） |
| `create_time` | TEXT | NOT NULL | 评论创建时间 |

说明：

- 评论按 `create_time ASC, id ASC` 正序展示。
- `post_id` 使用 `ON DELETE CASCADE`，删除帖子时级联删除关联评论。

### 3.4 关注关系表 `follow`

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY | 主键 |
| `follower_id` | INTEGER | NOT NULL REFERENCES `user`(id) | 关注者 ID |
| `followed_id` | INTEGER | NOT NULL REFERENCES `user`(id) | 被关注者 ID |
| `create_time` | TEXT | NOT NULL | 关注时间 |
| 唯一约束 | UNIQUE(follower_id, followed_id) | — | 防止重复关注 |

### 3.5 用户 LLM 配置表 `user_llm_config`

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY | 主键 |
| `user_id` | INTEGER | NOT NULL UNIQUE REFERENCES `user`(id) | 用户 ID（每用户一行） |
| `base_url` | TEXT | NOT NULL DEFAULT '' | OpenAI 兼容接口地址（如 `https://api.deepseek.com/v1`） |
| `api_key` | TEXT | NOT NULL DEFAULT '' | 用户自配 API Key |
| `model` | TEXT | NOT NULL DEFAULT '' | 模型名（如 `deepseek-chat`） |
| `create_time` | TEXT | NOT NULL | 创建时间 |
| `update_time` | TEXT | NOT NULL | 更新时间 |

### 3.6 学术匹配检索记录表 `academic_search`

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY | 主键 |
| `user_id` | INTEGER | NOT NULL REFERENCES `user`(id) | 检索用户 |
| `keyword` | TEXT | NOT NULL | 检索关键词 |
| `result_count` | INTEGER | NOT NULL DEFAULT 0 | 结果数量 |
| `summary` | TEXT | NOT NULL DEFAULT '' | LLM 分析摘要 |
| `results_json` | TEXT | NOT NULL DEFAULT '' | 结果快照 JSON（兼容迁移列） |
| `create_time` | TEXT | NOT NULL | 检索时间 |

### 3.7 消息表 `message`

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY | 主键 |
| `msg_type` | TEXT | NOT NULL DEFAULT 'private' | 类型：`private` 私信 / `system` 系统通知 |
| `sender_id` | INTEGER | REFERENCES `user`(id) | 发送者（系统通知可为 NULL） |
| `receiver_id` | INTEGER | NOT NULL REFERENCES `user`(id) | 接收者 |
| `content` | TEXT | NOT NULL | 内容（Markdown） |
| `link` | TEXT | NOT NULL DEFAULT '' | 关联跳转链接 |
| `is_read` | INTEGER | NOT NULL DEFAULT 0 | 是否已读（0/1） |
| `create_time` | TEXT | NOT NULL | 发送时间 |

说明：

- 私信（`msg_type='private'`）为好友间聊天，后端以 SSE 实时推送。
- 系统通知（`msg_type='system'`）用于 @提及、好友请求等；未读徽标只统计 `system` 类型。

### 3.8 好友关系表 `friend`

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY | 主键 |
| `user_id` | INTEGER | NOT NULL REFERENCES `user`(id) | 用户 A |
| `friend_id` | INTEGER | NOT NULL REFERENCES `user`(id) | 用户 B（互为好友各存一行） |
| `create_time` | TEXT | NOT NULL | 建立时间 |
| 唯一约束 | UNIQUE(user_id, friend_id) | — | 防止重复好友关系 |

### 3.9 好友请求表 `friend_request`

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY | 主键 |
| `from_id` | INTEGER | NOT NULL REFERENCES `user`(id) | 请求发起者 |
| `to_id` | INTEGER | NOT NULL REFERENCES `user`(id) | 请求接收者 |
| `status` | TEXT | NOT NULL DEFAULT 'pending' | 状态：`pending` / `accepted` / `rejected` |
| `create_time` | TEXT | NOT NULL | 请求时间 |
| 唯一约束 | UNIQUE(from_id, to_id) | — | 防止重复请求 |

## 4. 实体关系设计

### 4.1 关系说明

- 用户 1 -> n 帖子、评论、关注记录、LLM 配置、检索记录、消息、好友、好友请求
- 帖子 1 -> n 评论（级联删除）
- 用户 n -> n 用户（关注关系：`follow`；好友关系：`friend`）

### 4.2 ER 关系简图

```text
user  ──< post
  │       └──< comment
  ├──< follow            (follower_id -> user.id)
  ├──< follow            (followed_id -> user.id)
  ├──< user_llm_config   (每用户一行)
  ├──< academic_search
  ├──< message           (sender_id / receiver_id -> user.id)
  ├──< friend            (user_id / friend_id -> user.id)
  └──< friend_request    (from_id / to_id -> user.id)
```

## 5. 建表 SQL（PostgreSQL）

以下 SQL 与 `app.py` 中 `init_db()` 保持一致（PostgreSQL 语法，`SERIAL` 自增、`REFERENCES` 外键）：

```sql
CREATE TABLE IF NOT EXISTS "user" (
    id          SERIAL PRIMARY KEY,
    username    TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    create_time TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS post (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES "user"(id),
    title       TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    create_time TEXT    NOT NULL,
    update_time TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS comment (
    id          SERIAL PRIMARY KEY,
    post_id     INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES "user"(id),
    content     TEXT    NOT NULL,
    create_time TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS follow (
    id          SERIAL PRIMARY KEY,
    follower_id INTEGER NOT NULL REFERENCES "user"(id),
    followed_id INTEGER NOT NULL REFERENCES "user"(id),
    create_time TEXT    NOT NULL,
    UNIQUE(follower_id, followed_id)
);

CREATE TABLE IF NOT EXISTS user_llm_config (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL UNIQUE REFERENCES "user"(id),
    base_url    TEXT    NOT NULL DEFAULT '',
    api_key     TEXT    NOT NULL DEFAULT '',
    model       TEXT    NOT NULL DEFAULT '',
    create_time TEXT    NOT NULL,
    update_time TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS academic_search (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES "user"(id),
    keyword      TEXT    NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0,
    summary      TEXT    NOT NULL DEFAULT '',
    results_json TEXT    NOT NULL DEFAULT '',
    create_time  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS message (
    id          SERIAL PRIMARY KEY,
    msg_type    TEXT    NOT NULL DEFAULT 'private',
    sender_id   INTEGER REFERENCES "user"(id),
    receiver_id INTEGER NOT NULL REFERENCES "user"(id),
    content     TEXT    NOT NULL,
    link        TEXT    NOT NULL DEFAULT '',
    is_read     INTEGER NOT NULL DEFAULT 0,
    create_time TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS friend (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES "user"(id),
    friend_id   INTEGER NOT NULL REFERENCES "user"(id),
    create_time TEXT    NOT NULL,
    UNIQUE(user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS friend_request (
    id          SERIAL PRIMARY KEY,
    from_id     INTEGER NOT NULL REFERENCES "user"(id),
    to_id       INTEGER NOT NULL REFERENCES "user"(id),
    status      TEXT    NOT NULL DEFAULT 'pending',
    create_time TEXT    NOT NULL,
    UNIQUE(from_id, to_id)
);
```

### 兼容迁移（已有库升级）

`init_db()` 对旧库追加的列（`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，幂等）：

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS avatar TEXT NOT NULL DEFAULT '';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS learning_interest TEXT NOT NULL DEFAULT '';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_active TIMESTAMP;
ALTER TABLE post ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '';
ALTER TABLE academic_search ADD COLUMN IF NOT EXISTS results_json TEXT NOT NULL DEFAULT '';
```

## 6. 关键约束与设计规则

### 6.1 数据完整性约束

- 所有核心字段均为 `NOT NULL`
- `user.username` 唯一
- 外键均引用 `user(id)` / `post(id)`，保证引用完整性
- `follow`、`friend`、`friend_request` 各有唯一约束防止重复关系

### 6.2 级联删除策略

- 删除帖子 → 级联删除其评论（`comment.post_id ON DELETE CASCADE`）
- 用户删除（预留）：其余关联表默认不级联（本版未提供注销功能）

### 6.3 时间字段设计

- 统一 `TEXT`，格式 `YYYY-MM-DD HH:MM:SS`
- `user.last_active` 为 `TIMESTAMP`（在线状态判断用 `now()` 刷新）

## 7. 数据访问说明

- 未使用 ORM，全部原生 SQL（参数化占位符 `%s`）。
- 连接方式：`psycopg2.connect(host/port/user/password/dbname)`，环境变量可覆盖（容器内由 compose 注入）。
- 游标：`psycopg2.extras.RealDictCursor`，按字段名读取。
- PostgreSQL 不支持单条 `execute` 多语句，`init_db()` 逐条执行。
- 自增 ID：`INSERT ... RETURNING id` 获取新行主键。

## 8. 业务操作与数据流

### 8.1 用户注册 / 登录
1. 校验用户名、密码非空，用户名查重。
2. 插入 `user` 记录；登录成功后写入 Flask 签名 Cookie Session（`session["user_id"]`）。

### 8.2 在线状态
- 登录用户每次请求（`before_request`）执行 `UPDATE "user" SET last_active = now()`。
- 接口返回 `is_online`：`last_active` 距今 ≤ 2 分钟视为在线。

### 8.3 发布帖子 / 评论
1. 校验登录状态、内容非空。
2. 发帖时从正文提取 `#标签` 写入 `post.tags`（逗号分隔）。
3. 插入 `post` / `comment` 记录。

### 8.4 关注 / 好友
- 关注：`follow` 插入一行；取消关注删除对应行。
- 好友：`friend_request` 发送（status=pending）→ 对方接受后各写一行 `friend`，并发送系统通知（`message`，msg_type='system'）。

### 8.5 私信 / 通知
- 私信：`message`（msg_type='private'），好友间发送；写入后经 SSE 实时推送给接收方。
- 通知：`message`（msg_type='system'）；未读徽标统计 `msg_type='system' AND is_read=0`；打开会话/列表自动标记已读。

### 8.6 学术匹配
1. 用户提交关键词 → 后端检索 OpenAlex 文献（`academic_match.search_openalex`）。
2. 可选调用用户自配 LLM（`user_llm_config`）生成摘要（`analyze_matches`）。
3. 结果与摘要写入 `academic_search`（results_json 快照），供历史查看。

## 9. 安全与限制说明

- 密码当前为明文存储（教学版约束），生产部署建议升级为哈希（如 `werkzeug.security` 或 bcrypt）。
- 未增加审计日志、管理员角色表。
- 用户 LLM API Key 仅存于 `user_llm_config`，前端不回显明文。
- 上传文件存储在 `static/uploads`（后端上传卷 `uploads-data`），数据库不存文件二进制。

## 10. 后续扩展建议

- 密码哈希存储
- 帖子点赞 / 收藏 / 编辑历史
- 帖子分类表（替代标签字符串）
- 管理员后台权限体系
- 操作日志审计

当前版本不默认启用上述扩展。
