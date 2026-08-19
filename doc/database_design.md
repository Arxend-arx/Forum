# 轻量论坛系统数据库设计文档

## 1. 文档概述

本文档描述轻量化 Flask Forum 系统的数据库设计方案。系统严格使用 Python 内置 `sqlite3`，数据库文件为 `forum.db`，采用三表结构：

- `user`：用户表
- `post`：帖子表
- `comment`：评论表

数据库设计目标：

- 满足用户注册、登录、发帖、评论的基础论坛业务
- 保持结构简单，适合本地教学与轻量部署
- 严格遵守技能要求，仅使用三张核心业务表

## 2. 数据库基础信息

| 项目 | 内容 |
| --- | --- |
| 数据库类型 | SQLite |
| 数据库文件 | `forum.db` |
| 驱动方式 | Python 内置 `sqlite3` |
| 建库方式 | 应用启动时自动初始化 |
| ORM 使用情况 | 不使用 ORM |
| 外部数据库服务 | 不使用 |

## 3. 表结构设计

### 3.1 用户表 `user`

用于存储论坛用户基础信息。

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 用户主键 |
| `username` | TEXT | NOT NULL, UNIQUE | 用户名，必须唯一 |
| `password` | TEXT | NOT NULL | 用户密码 |
| `create_time` | TEXT | NOT NULL | 用户创建时间 |

说明：

- `username` 通过唯一约束防止重复注册
- 当前版本为教学型基础实现，密码按明文存储，不启用扩展加密功能

### 3.2 帖子表 `post`

用于存储论坛帖子信息。

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 帖子主键 |
| `user_id` | INTEGER | NOT NULL | 发帖用户 ID |
| `title` | TEXT | NOT NULL | 帖子标题 |
| `content` | TEXT | NOT NULL | 帖子正文 |
| `create_time` | TEXT | NOT NULL | 创建时间 |
| `update_time` | TEXT | NOT NULL | 更新时间 |

外键关系：

- `user_id -> user.id`

说明：

- 每篇帖子必须归属于一个已存在用户
- 首页按 `create_time DESC, id DESC` 倒序展示

### 3.3 评论表 `comment`

用于存储帖子评论信息。

| 字段名 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 评论主键 |
| `post_id` | INTEGER | NOT NULL | 所属帖子 ID |
| `user_id` | INTEGER | NOT NULL | 评论用户 ID |
| `content` | TEXT | NOT NULL | 评论内容 |
| `create_time` | TEXT | NOT NULL | 评论创建时间 |

外键关系：

- `post_id -> post.id`
- `user_id -> user.id`

说明：

- 评论按 `create_time ASC, id ASC` 正序展示
- `post_id` 使用 `ON DELETE CASCADE`，当帖子删除时，关联评论自动删除

## 4. 实体关系设计

### 4.1 关系说明

- 一个用户可以发布多篇帖子：`user 1 -> n post`
- 一个用户可以发布多条评论：`user 1 -> n comment`
- 一篇帖子可以拥有多条评论：`post 1 -> n comment`

### 4.2 ER 关系简图

```text
user
 ├── id (PK)
 ├── username (UNIQUE)
 ├── password
 └── create_time
      |
      | 1 -> n
      v
post
 ├── id (PK)
 ├── user_id (FK -> user.id)
 ├── title
 ├── content
 ├── create_time
 └── update_time
      |
      | 1 -> n
      v
comment
 ├── id (PK)
 ├── post_id (FK -> post.id, ON DELETE CASCADE)
 ├── user_id (FK -> user.id)
 ├── content
 └── create_time
```

## 5. 建表 SQL

以下 SQL 与当前项目实现保持一致：

```sql
CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    create_time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    create_time TEXT NOT NULL,
    update_time TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TABLE IF NOT EXISTS comment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    create_time TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES post (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user (id)
);
```

注意：项目实际代码中的 `comment.id` 为主键，`post_id` 为普通外键字段。若手工执行 SQL，请以应用代码初始化结果为准。

## 6. 关键约束与设计规则

### 6.1 数据完整性约束

- 所有核心字段均为 `NOT NULL`
- `user.username` 必须唯一
- `post.user_id` 必须引用存在的用户
- `comment.post_id` 必须引用存在的帖子
- `comment.user_id` 必须引用存在的用户

### 6.2 级联删除策略

系统要求删除帖子时自动删除其下所有评论，因此在 `comment.post_id` 上设置：

```sql
FOREIGN KEY (post_id) REFERENCES post (id) ON DELETE CASCADE
```

该设计可保证：

- 删除帖子后不会留下孤立评论
- 简化业务删除逻辑
- 数据库层与应用层双重保证一致性

### 6.3 时间字段设计

当前项目所有时间字段均为 `TEXT` 类型，格式为：

```text
YYYY-MM-DD HH:MM:SS
```

例如：

```text
2026-07-29 17:43:21
```

这样设计的优点：

- 兼容 SQLite 轻量使用方式
- 便于模板直接渲染展示
- 便于按字符串进行基础排序

## 7. 数据访问说明

系统未使用 ORM，全部通过原生 SQL 操作数据库。

当前数据库访问方式特点：

- 每次请求按需创建连接
- 设置 `row_factory = sqlite3.Row`，便于按字段名读取
- 每次连接执行 `PRAGMA foreign_keys = ON`，确保外键与级联删除生效

## 8. 业务操作与数据流

### 8.1 用户注册

1. 校验用户名和密码非空
2. 查询 `user` 表确认用户名未重复
3. 插入新用户记录

### 8.2 用户登录

1. 根据用户名和密码查询 `user`
2. 校验成功后写入 session

### 8.3 发布帖子

1. 校验登录状态
2. 校验标题、内容非空
3. 向 `post` 表写入记录

### 8.4 发布评论

1. 校验登录状态
2. 校验帖子存在
3. 校验评论内容非空
4. 向 `comment` 表写入记录

### 8.5 删除帖子

1. 校验登录状态
2. 校验当前用户是帖子作者
3. 删除 `post` 记录
4. 数据库自动级联删除关联 `comment`

### 8.6 删除评论

1. 校验登录状态
2. 校验当前用户是评论作者
3. 删除 `comment` 记录

## 9. 安全与限制说明

当前数据库设计遵循技能基础版要求，未启用扩展安全功能，因此有以下边界：

- 密码未做哈希加密
- 未增加审计日志表
- 未增加管理员表或角色权限表
- 未增加帖子分类、标签、点赞等扩展表

这意味着数据库结构保持最小可运行闭环，更适合教学、演示和本地轻量项目。

## 10. 后续扩展建议

如后续需要扩展业务，可在不破坏现有三表基础功能的前提下新增文档与版本规划。常见扩展方向包括：

- 密码哈希存储
- 帖子编辑历史
- 分类标签体系
- 点赞与收藏功能
- 操作日志审计
- 管理员后台权限体系

当前版本不默认启用上述扩展。
