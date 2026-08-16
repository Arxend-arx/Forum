# AcademicForumLite 前后端分离重构 · 设计文档

| 项目 | 内容 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-08-07 |
| 状态 | 待评审 |
| 关联 | [PRD.md](./PRD.md) |

---

## 1. 总体架构

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│   React SPA（独立工程）       │  HTTP  │   Flask REST API 服务         │
│   Vite + React 18 + Router   │ ─────► │   /api/* JSON                │
│   i18n / 主题 / 组件化        │  JSON  │   PostgreSQL 16（独立容器）   │
│   Dev: :5173  Prod: 静态托管 │ ◄───── │   academic_match.py 复用      │
└─────────────────────────────┘        └──────────────────────────────┘
              │  CORS (allow credentials) / 开发期 Vite 代理
              ▼
       用户生成内容直链：/uploads/*（图片/视频）
```

- **认证方案**：沿用 Flask 签名 Cookie Session（`session["user_id"]`）。前端 `fetch` 携带凭据（`credentials: 'include'`），CORS 开启 `allow_credentials`。开发期由 Vite 代理规避跨域；生产期建议同域 Nginx 反代（`/api` → Flask，`/` → 前端静态资源）。
- **响应格式**：统一 `{ "ok": true, "data": ... }` 与 `{ "ok": false, "error": "...", "code": 401|403|404|400|500 }`。错误码语义：
  - 400 参数/校验错误，401 未登录，403 无权限，404 资源不存在，500 服务端错误。
- **状态管理**：轻量方案，React Context + `useReducer` 维护「当前用户 / 语言 / 主题」；业务数据按页面局部 state 拉取，避免引入重型全局 store。

## 2. 后端 API 契约（REST）

所有接口前缀 `/api`，除标注外均返回 JSON。

### 2.1 认证
| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | /api/auth/register | 注册 `{username, password}` | 公开 |
| POST | /api/auth/login | 登录 `{username, password}` | 公开 |
| POST | /api/auth/logout | 退出 | 登录 |
| GET | /api/auth/me | 当前用户信息 | 登录 |

### 2.2 帖子与评论
| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | /api/posts | 帖子列表（`?page=&size=`） | 公开 |
| POST | /api/posts | 发帖 `{title, content}` | 登录 |
| GET | /api/posts/{id} | 帖子详情（含评论） | 公开 |
| DELETE | /api/posts/{id} | 删帖 | 作者 |
| POST | /api/posts/{id}/comments | 评论 `{content}`（支持 @提及） | 登录 |
| DELETE | /api/comments/{id} | 删评论 | 作者 |

### 2.3 搜索
| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | /api/search?q= | 返回 `{posts:[], users:[]}` | 公开 |

### 2.4 用户 / 关注 / 资料
| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | /api/users/{id} | 资料页数据（含统计/关注列表/帖子） | 公开 |
| PUT | /api/users/me | 编辑资料 `{avatar, bio, learning_interest}` | 登录 |
| POST/DELETE | /api/users/{id}/follow | 关注 / 取消关注 | 登录 |

### 2.5 好友
| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | /api/friends/requests | 发送请求 `{user_id}` | 登录 |
| GET | /api/friends/requests | 我收到的 + 我发出的 | 登录 |
| POST | /api/friends/requests/{id}/accept | 接受 | 登录 |
| POST | /api/friends/requests/{id}/reject | 拒绝 | 登录 |
| DELETE | /api/friends/{id} | 解除好友 | 登录 |

### 2.6 聊天 / 消息
| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | /api/chat | 好友列表 + 最近对话（含未读） | 登录 |
| GET | /api/chat/{userId} | 往来消息（自动标记已读） | 登录 |
| POST | /api/chat/{userId}/send | 发送私信 `{content}` | 登录 |
| GET | /api/messages | 系统通知列表（自动标记已读） | 登录 |

### 2.7 上传
| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | /api/upload | multipart `file` → `{url}` | 登录 |

### 2.8 学术匹配 / LLM
| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | /api/match | 入口状态（学习意向 / LLM 可用 / 文献源可用） | 登录 |
| POST | /api/match/search | 检索 `{keyword, use_interest, use_llm}` → 重定向结果 id | 登录 |
| GET | /api/match/result/{id} | 结果页数据 | 登录 |
| GET | /api/match/history | 历史记录 | 登录 |
| GET | /api/settings/llm | 获取配置（脱敏） | 登录 |
| POST | /api/settings/llm | 保存配置 | 登录 |
| POST | /api/settings/llm/test | 连接测试 | 登录 |

## 3. 前端工程结构

```
forum_project/
  app.py                 # Flask API（改造后保留）
  academic_match.py      # 复用，不动
  ...
frontend/                # 新增 React 工程
  vite.config.ts         # dev 代理 /api
  package.json
  index.html
  src/
    main.tsx
    App.tsx              # 路由 + 全局 Provider
    api/client.ts        # fetch 封装（携带凭据、统一错误）
    i18n/                # react-i18next 配置 + zh/en 文案
    theme/               # 主题令牌（CSS Variables）+ 切换逻辑
    context/             # AuthContext / SettingsContext
    components/          # Navbar / PostCard / Toast / Modal / EmptyState...
    pages/               # 每个路由一个页面组件
    styles/              # 全局样式、设计令牌
```

**路由表**：`/`、`/post/:id`、`/create`、`/search`、`/profile/:id`、`/profile/edit`、`/match`、`/match/history`、`/settings/llm`、`/chat`、`/chat/:userId`、`/messages`、`/friends/requests`、`/login`、`/register`。

**i18n**：react-i18next，语言包 `zh` / `en`，localStorage 持久化，`<html lang>` 同步更新。

**主题**：CSS Variables 双套令牌（light / dark），`data-theme` 属性切换，localStorage 持久化 + `prefers-color-scheme` 初始探测。

## 4. UI 设计规范

### 4.1 设计令牌（Design Tokens）
| 令牌 | 浅色 | 深色 | 用途 |
|---|---|---|---|
| --bg | #f7f8fa | #0f1115 | 页面背景 |
| --surface | #ffffff | #1a1d24 | 卡片/导航背景 |
| --surface-2 | #f2f4f8 | #232833 | 次级区块/悬浮 |
| --text | #1c2030 | #e6e9ef | 主文字 |
| --text-2 | #5b6472 | #9aa3b2 | 次级文字 |
| --border | #e4e7ec | #2c3240 | 边框/分隔 |
| --primary | 各风格自定 | 各风格自定 | 品牌主色 |
| --danger/success/warning | 语义色 | 语义色 | 状态色 |

圆角 `--radius: 8/12/16px`；阴影分 3 级；字阶 12/14/16/20/24px；动效 150–250ms 缓动。

### 4.2 三款原型风格定位（M3 产出，供选择）

| 原型 | 风格 | 主色 | 布局特征 | 适用气质 |
|---|---|---|---|---|
| A「幽蓝深空」 | 深色科技 + 玻璃拟态 | 靛蓝 #4f6bff | 左侧窄边栏 + 中央内容流，卡片半透明模糊，渐变光斑背景 | 硬核/技术社区 |
| B「云白轻盈」 | 浅色清新 + 柔和卡片 | 青绿 #0ea5a4 | 顶部通栏 + 宽卡片流，大留白，圆角更大，图标点缀 | 亲和/学习社区 |
| C「墨线极简」 | 中性灰白 + 细线框 | 紫罗兰 #7c5cff | 极简双栏（主内容+右栏），细边框无填充卡片，强排版 | 效率/极客工具 |

每款原型均演示：**导航栏、帖子列表卡片、侧栏组件、语言切换、深浅主题切换**。

### 4.3 通用交互规范
- 加载态：骨架屏（列表）/ 局部 spinner（按钮）。
- 空态：图标 + 文案 + 行动按钮。
- 反馈：顶部/角落 Toast（成功/失败/警告）；破坏性操作（删帖/删好友）二次确认弹窗。
- 响应式：≥1024px 双栏，768–1024px 单栏收缩，<768px 底部标签导航（移动端）。
- 可访问性：键盘可聚焦、对比度达标、`aria-label` 标注图标按钮。

## 5. 数据与兼容

- 数据库为 **PostgreSQL 16**（独立容器 `academy-db`，数据卷持久化）；后端通过 `psycopg2` 直连，`init_db()` 幂等建表 + 兼容迁移（`ADD COLUMN IF NOT EXISTS`）。
- `academic_match.py` 提供 OpenAlex 文献检索（免费源，无需 Key）+ 用户自配 LLM 分析；`config.json` 仅含说明文案，无密钥。
- 上传目录 `static/uploads` 不变（后端上传卷挂载）；新架构下图片 URL 由后端返回 `/uploads/*` 或 `/api/upload` 结果。
