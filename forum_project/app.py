"""
AcademicForumLite - Flask REST API 后端（前后端分离版 · PostgreSQL）
======================================================
- 数据库: PostgreSQL（默认库 academy，连接参数经环境变量 PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE 配置）
- 认证: Flask 签名 Cookie Session（同源部署；开发期由 Vite 代理 /api）
- 响应: 统一 { ok: bool, data? / error? code? }
- 学术匹配: 复用 academic_match.py（OpenAlex 文献检索 + 用户自配 LLM）
"""

import json
import os
import queue
import re
import threading
import time
import uuid
from datetime import datetime
from functools import wraps

import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, request, session, g, jsonify

from academic_match import (
    search_openalex,
    llm_chat, analyze_matches, save_search,
)

# ---------------------------------------------------------------------------
# App 初始化
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.urandom(24).hex()  # 每次启动重新生成，重启后会话失效

# 前后端分离：CORS 支持（携带凭据）。开发期亦可由 Vite 代理 /api 规避跨域。
_ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}


@app.after_request
def _cors(resp):
    origin = request.headers.get("Origin")
    if origin in _ALLOWED_ORIGINS:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.route("/api/health", methods=["GET", "OPTIONS"])
def _health():
    if request.method == "OPTIONS":
        return ("", 204)
    return jsonify({"ok": True, "data": "alive"})


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 上传目录可通过环境变量覆盖（Docker 部署时挂载卷）
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(BASE_DIR, "static", "uploads"))
ALLOWED_IMG_EXT = {"jpg", "jpeg", "png", "gif", "webp", "bmp"}
ALLOWED_VIDEO_EXT = {"mp4", "webm", "ogg", "mov", "mkv"}
MAX_IMG_SIZE = 5 * 1024 * 1024
MAX_VIDEO_SIZE = 100 * 1024 * 1024


# ---------------------------------------------------------------------------
# 统一响应工具
# ---------------------------------------------------------------------------
def ok(data=None):
    return jsonify({"ok": True, "data": data})


def fail(msg, code=400):
    return jsonify({"ok": False, "error": msg, "code": code}), code


# ---------------------------------------------------------------------------
# 数据库（PostgreSQL）
# ---------------------------------------------------------------------------
class _Conn:
    """psycopg2 连接包装：提供 sqlite3 风格的 db.execute(...)（自动创建 cursor）"""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=None):
        cur = self._conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(sql, params or ())
        return cur

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def get_db() -> _Conn:
    """获取当前请求的数据库连接（execute 返回 RealDictCursor，字段名可访问），请求结束自动关闭"""
    if "db" not in g:
        g.db = _Conn(psycopg2.connect(
            host=os.environ.get("PGHOST", "localhost"),
            port=os.environ.get("PGPORT", "5432"),
            user=os.environ.get("PGUSER", "academy"),
            password=os.environ.get("PGPASSWORD", "academy"),
            dbname=os.environ.get("PGDATABASE", "academy"),
        ))
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def init_db():
    """建表 + 兼容迁移（幂等，PostgreSQL 语法）"""
    db = psycopg2.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=os.environ.get("PGPORT", "5432"),
        user=os.environ.get("PGUSER", "academy"),
        password=os.environ.get("PGPASSWORD", "academy"),
        dbname=os.environ.get("PGDATABASE", "academy"),
    )
    cur = db.cursor()
    # PostgreSQL 不允许单条 execute 包含多条语句，故逐条执行
    schema_statements = [
        """CREATE TABLE IF NOT EXISTS "user" (
            id          SERIAL PRIMARY KEY,
            username    TEXT    NOT NULL UNIQUE,
            password    TEXT    NOT NULL,
            create_time TEXT    NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS post (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL REFERENCES "user"(id),
            title       TEXT    NOT NULL,
            content     TEXT    NOT NULL,
            create_time TEXT    NOT NULL,
            update_time TEXT    NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS comment (
            id          SERIAL PRIMARY KEY,
            post_id     INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
            user_id     INTEGER NOT NULL REFERENCES "user"(id),
            content     TEXT    NOT NULL,
            create_time TEXT    NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS follow (
            id          SERIAL PRIMARY KEY,
            follower_id INTEGER NOT NULL REFERENCES "user"(id),
            followed_id INTEGER NOT NULL REFERENCES "user"(id),
            create_time TEXT    NOT NULL,
            UNIQUE(follower_id, followed_id)
        )""",
        """CREATE TABLE IF NOT EXISTS user_llm_config (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL UNIQUE REFERENCES "user"(id),
            base_url    TEXT    NOT NULL DEFAULT '',
            api_key     TEXT    NOT NULL DEFAULT '',
            model       TEXT    NOT NULL DEFAULT '',
            create_time TEXT    NOT NULL,
            update_time TEXT    NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS academic_search (
            id           SERIAL PRIMARY KEY,
            user_id      INTEGER NOT NULL REFERENCES "user"(id),
            keyword      TEXT    NOT NULL,
            result_count INTEGER NOT NULL DEFAULT 0,
            summary      TEXT    NOT NULL DEFAULT '',
            results_json TEXT    NOT NULL DEFAULT '',
            create_time  TEXT    NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS message (
            id          SERIAL PRIMARY KEY,
            msg_type    TEXT    NOT NULL DEFAULT 'private',
            sender_id   INTEGER REFERENCES "user"(id),
            receiver_id INTEGER NOT NULL REFERENCES "user"(id),
            content     TEXT    NOT NULL,
            link        TEXT    NOT NULL DEFAULT '',
            is_read     INTEGER NOT NULL DEFAULT 0,
            create_time TEXT    NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS friend (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL REFERENCES "user"(id),
            friend_id   INTEGER NOT NULL REFERENCES "user"(id),
            create_time TEXT    NOT NULL,
            UNIQUE(user_id, friend_id)
        )""",
        """CREATE TABLE IF NOT EXISTS friend_request (
            id          SERIAL PRIMARY KEY,
            from_id     INTEGER NOT NULL REFERENCES "user"(id),
            to_id       INTEGER NOT NULL REFERENCES "user"(id),
            status      TEXT    NOT NULL DEFAULT 'pending',
            create_time TEXT    NOT NULL,
            UNIQUE(from_id, to_id)
        )""",
    ]
    for stmt in schema_statements:
        cur.execute(stmt)
    # 兼容迁移：为已有 user 表追加 profile 字段
    for col in ["avatar", "bio", "learning_interest"]:
        cur.execute(
            f'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS {col} TEXT NOT NULL DEFAULT \'\''
        )
    cur.execute(
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_active TIMESTAMP'
    )
    cur.execute(
        "ALTER TABLE post ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT ''"
    )
    cur.execute(
        "ALTER TABLE academic_search ADD COLUMN IF NOT EXISTS "
        "results_json TEXT NOT NULL DEFAULT ''"
    )
    # 第二轮升级：国籍 / 角色
    cur.execute(
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS nationality TEXT NOT NULL DEFAULT \'\''
    )
    cur.execute(
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT \'user\''
    )
    # 公告表
    cur.execute("""
        CREATE TABLE IF NOT EXISTS announcement (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL REFERENCES "user"(id),
            title       TEXT    NOT NULL,
            content     TEXT    NOT NULL,
            create_time TEXT    NOT NULL
        )
    """)
    # 兼容迁移：为旧公告表补发布者列（可空；旧行无发布者记录，留 NULL 表示系统发布。
    # 注意不能加 NOT NULL DEFAULT 0 + 外键——会为旧行填充 0 并立即校验外键而失败）
    cur.execute(
        'ALTER TABLE announcement ADD COLUMN IF NOT EXISTS '
        'user_id INTEGER REFERENCES "user"(id)'
    )
    # 种子管理员账号（密码可用环境变量 ADMIN_PASSWORD 覆盖，默认 admin123）
    admin_pwd = os.environ.get("ADMIN_PASSWORD", "admin123")
    cur.execute(
        """INSERT INTO "user" (username, password, create_time, role)
           SELECT %s, %s, %s, 'admin'
           WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE username = %s)""",
        ("admin", admin_pwd, now(), "admin"),
    )
    db.commit()
    cur.close()
    db.close()


# ---------------------------------------------------------------------------
# 认证
# ---------------------------------------------------------------------------
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return fail("请先登录", 401)
        return f(*args, **kwargs)
    return decorated


def _is_admin(db) -> bool:
    """当前登录用户是否为管理员（角色 role='admin'）"""
    uid = session.get("user_id")
    if not uid:
        return False
    row = db.execute('SELECT role FROM "user" WHERE id = %s', (uid,)).fetchone()
    return bool(row and row["role"] == "admin")


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return fail("请先登录", 401)
        if not _is_admin(get_db()):
            return fail("需要管理员权限", 403)
        return f(*args, **kwargs)
    return decorated


@app.before_request
def _touch_last_active():
    """登录用户每次请求刷新在线时间戳（供在线状态展示，2 分钟内视为在线）"""
    if "user_id" not in session:
        return
    db = get_db()
    db.execute("UPDATE \"user\" SET last_active = now() WHERE id = %s", (session["user_id"],))
    db.commit()


def _current_user_id() -> int:
    return session["user_id"]


# ---------------------------------------------------------------------------
# 认证接口
# ---------------------------------------------------------------------------
@app.route("/api/auth/register", methods=["POST"])
def api_register():
    data = request.get_json(silent=True) or request.form
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    if not username or not password:
        return fail("用户名和密码不能为空")
    db = get_db()
    if db.execute("SELECT id FROM \"user\" WHERE username = %s", (username,)).fetchone():
        return fail("用户名已存在，请更换")
    db.execute(
        "INSERT INTO \"user\" (username, password, create_time) VALUES (%s, %s, %s)",
        (username, password, now()))
    db.commit()
    return ok({"username": username})


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or request.form
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    if not username or not password:
        return fail("用户名和密码不能为空")
    db = get_db()
    user = db.execute(
        "SELECT id, username FROM \"user\" WHERE username = %s AND password = %s",
        (username, password)).fetchone()
    if user is None:
        return fail("用户名或密码错误", 401)
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    return ok(_user_payload(db, user["id"]))


@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    session.clear()
    return ok()


@app.route("/api/auth/me", methods=["GET"])
@login_required
def api_me():
    db = get_db()
    return ok(_user_payload(db, _current_user_id()))


def _user_payload(db, user_id):
    """当前用户信息（含未读数），供登录/me/导航徽标使用"""
    u = db.execute(
        "SELECT id, username, avatar, bio, learning_interest, nationality, role, create_time "
        "FROM \"user\" WHERE id = %s", (user_id,)).fetchone()
    if u is None:
        return None
    unread = db.execute(
        "SELECT COUNT(*) AS c FROM message "
        "WHERE receiver_id = %s AND msg_type = 'system' AND is_read = 0",
        (user_id,)).fetchone()["c"]
    return dict(u) | {"unread_count": unread}


# ---------------------------------------------------------------------------
# 帖子与评论
# ---------------------------------------------------------------------------
def _post_row(db, row):
    """将帖子行转为 API 对象（附加作者名/头像与评论数）"""
    p = dict(row)
    author = db.execute(
        "SELECT username, avatar FROM \"user\" WHERE id = %s", (p["user_id"],)).fetchone()
    p["author"] = author["username"] if author else "已注销"
    p["author_avatar"] = (author["avatar"] if author else "") or ""
    p["comment_count"] = db.execute(
        "SELECT COUNT(*) AS c FROM comment WHERE post_id = %s",
        (p["id"],)).fetchone()["c"]
    return p


@app.route("/api/posts", methods=["GET"])
def api_posts():
    db = get_db()
    sort = request.args.get("sort", "latest")          # latest | hot
    tag = (request.args.get("tag") or "").strip()
    where, params = "", []
    if tag:
        where = " WHERE p.tags LIKE %s"
        params.append(f"%{tag}%")
    order = (
        " ORDER BY (SELECT COUNT(*) FROM comment c WHERE c.post_id = p.id) DESC, "
        "p.create_time DESC, p.id DESC"
        if sort == "hot"
        else " ORDER BY p.create_time DESC, p.id DESC"
    )
    rows = db.execute(f"""
        SELECT p.id, p.user_id, p.title, p.content, p.tags, p.create_time, p.update_time
        FROM post p{where}{order}
    """, params).fetchall()
    posts = [_post_row(db, r) for r in rows]
    for p in posts:  # 列表页裁剪正文
        p["content"] = (p["content"] or "")[:200]
    return ok(posts)


@app.route("/api/tags")
def api_tags():
    """全站 #标签聚合：按使用次数降序返回"""
    db = get_db()
    rows = db.execute("SELECT tags FROM post WHERE tags <> ''").fetchall()
    counter = {}
    for r in rows:
        for t in (r["tags"] or "").split(","):
            if t:
                counter[t] = counter.get(t, 0) + 1
    tags = sorted(counter.items(), key=lambda x: (-x[1], x[0]))
    return ok([{"name": name, "count": count} for name, count in tags])


@app.route("/api/posts", methods=["POST"])
@login_required
def api_create_post():
    data = request.get_json(silent=True) or request.form
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title or not content:
        return fail("标题和内容不能为空")
    db = get_db()
    tags = _extract_tags(content)
    cur = db.execute(
        "INSERT INTO post (user_id, title, content, tags, create_time, update_time) "
        "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
        (_current_user_id(), title, content, tags, now(), now()))
    db.commit()
    return ok({"id": cur.fetchone()["id"]}), 201


@app.route("/api/posts/<int:post_id>", methods=["GET"])
def api_post_detail(post_id):
    db = get_db()
    row = db.execute(
        "SELECT * FROM post WHERE id = %s", (post_id,)).fetchone()
    if row is None:
        return fail("帖子不存在", 404)
    post = _post_row(db, row)
    comments = db.execute("""
        SELECT c.*, u.username, u.avatar AS user_avatar FROM comment c
        JOIN "user" u ON c.user_id = u.id
        WHERE c.post_id = %s ORDER BY c.create_time ASC, c.id ASC
    """, (post_id,)).fetchall()
    post["comments"] = [dict(c) for c in comments]
    post["is_mine"] = session.get("user_id") == row["user_id"]
    return ok(post)


@app.route("/api/posts/<int:post_id>", methods=["DELETE"])
@login_required
def api_delete_post(post_id):
    db = get_db()
    post = db.execute("SELECT * FROM post WHERE id = %s", (post_id,)).fetchone()
    if post is None:
        return fail("帖子不存在", 404)
    if post["user_id"] != _current_user_id() and not _is_admin(db):
        return fail("只能删除自己的帖子", 403)
    db.execute("DELETE FROM post WHERE id = %s", (post_id,))
    db.commit()
    return ok()


@app.route("/api/posts/<int:post_id>/comments", methods=["POST"])
@login_required
def api_add_comment(post_id):
    data = request.get_json(silent=True) or request.form
    content = (data.get("content") or "").strip()
    if not content:
        return fail("评论内容不能为空")
    db = get_db()
    post = db.execute("SELECT id, title FROM post WHERE id = %s", (post_id,)).fetchone()
    if post is None:
        return fail("帖子不存在", 404)
    content = _parse_mentions(db, content, _current_user_id(), post)
    cur = db.execute(
        "INSERT INTO comment (post_id, user_id, content, create_time) "
        "VALUES (%s, %s, %s, %s) RETURNING id",
        (post_id, _current_user_id(), content, now()))
    db.commit()
    return ok({"id": cur.fetchone()["id"]}), 201


@app.route("/api/comments/<int:comment_id>", methods=["DELETE"])
@login_required
def api_delete_comment(comment_id):
    db = get_db()
    comment = db.execute("SELECT * FROM comment WHERE id = %s", (comment_id,)).fetchone()
    if comment is None:
        return fail("评论不存在", 404)
    if comment["user_id"] != _current_user_id():
        return fail("只能删除自己的评论", 403)
    db.execute("DELETE FROM comment WHERE id = %s", (comment_id,))
    db.commit()
    return ok()


def _parse_mentions(db, content, sender_id, post):
    def _replace(m):
        name = m.group(1)
        target = db.execute("SELECT id FROM \"user\" WHERE username = %s", (name,)).fetchone()
        if target is None or target["id"] == sender_id:
            return m.group(0)
        sender = db.execute("SELECT username FROM \"user\" WHERE id = %s", (sender_id,)).fetchone()
        sender_name = sender["username"] if sender else "某人"
        db.execute(
            "INSERT INTO message "
            "(msg_type, sender_id, receiver_id, content, link, is_read, create_time) "
            "VALUES ('system', %s, %s, %s, %s, 0, %s)",
            (sender_id, target["id"],
             f"{sender_name} 用户在「{post['title']}」中@了你",
             f"/post/{post['id']}", now()))
        return f"[@{name}](/profile/{target['id']})"
    return re.sub(r"@([\u4e00-\u9fa5A-Za-z0-9_\-]{2,20})", _replace, content)


def _extract_tags(content):
    """从正文提取 #标签（如 #深度学习、#AI），去重、最多 5 个，逗号分隔存储"""
    seen, out = set(), []
    for t in re.findall(r"#([\u4e00-\u9fa5A-Za-z0-9_\-]{1,20})", content or ""):
        if t not in seen:
            seen.add(t)
            out.append(t)
    return ",".join(out[:5])


# ---------------------------------------------------------------------------
# 搜索
# ---------------------------------------------------------------------------
@app.route("/api/search")
def api_search():
    q = (request.args.get("q") or "").strip()
    if not q:
        return ok({"posts": [], "users": []})
    db = get_db()
    like = f"%{q}%"
    posts = db.execute("""
        SELECT p.id, p.title, p.content, p.tags, p.create_time, p.user_id, u.username AS author,
               (SELECT COUNT(*) FROM comment c WHERE c.post_id = p.id) AS comment_count
        FROM post p JOIN "user" u ON p.user_id = u.id
        WHERE p.title LIKE %s OR p.content LIKE %s OR p.tags LIKE %s
        ORDER BY p.create_time DESC LIMIT 50
    """, (like, like, like)).fetchall()
    users = db.execute(
        "SELECT id, username, avatar, bio FROM \"user\" "
        "WHERE username LIKE %s ORDER BY id LIMIT 50", (like,)).fetchall()
    for p in posts:
        p = dict(p)
        p["content"] = (p["content"] or "")[:160]
    return ok({"posts": [dict(p) for p in posts], "users": [dict(u) for u in users]})


# ---------------------------------------------------------------------------
# 用户 / 关注
# ---------------------------------------------------------------------------
@app.route("/api/users/<int:user_id>")
def api_user_profile(user_id):
    db = get_db()
    user = db.execute(
        "SELECT id, username, avatar, bio, learning_interest, nationality, role, create_time, "
        "(last_active IS NOT NULL AND last_active > now() - interval '2 minutes') AS is_online "
        "FROM \"user\" WHERE id = %s", (user_id,)).fetchone()
    if user is None:
        return fail("用户不存在", 404)
    uid = user_id
    post_count = db.execute("SELECT COUNT(*) AS c FROM post WHERE user_id = %s", (uid,)).fetchone()["c"]
    following_count = db.execute("SELECT COUNT(*) AS c FROM follow WHERE follower_id = %s", (uid,)).fetchone()["c"]
    follower_count = db.execute("SELECT COUNT(*) AS c FROM follow WHERE followed_id = %s", (uid,)).fetchone()["c"]
    following_list = db.execute(
        "SELECT u.id, u.username, u.avatar FROM follow f JOIN \"user\" u ON f.followed_id = u.id "
        "WHERE f.follower_id = %s ORDER BY f.create_time DESC", (uid,)).fetchall()
    follower_list = db.execute(
        "SELECT u.id, u.username, u.avatar FROM follow f JOIN \"user\" u ON f.follower_id = u.id "
        "WHERE f.followed_id = %s ORDER BY f.create_time DESC", (uid,)).fetchall()
    posts = db.execute(
        "SELECT id, title, create_time FROM post WHERE user_id = %s "
        "ORDER BY create_time DESC LIMIT 20", (uid,)).fetchall()

    is_following = False
    friend_status = "none"
    is_me = session.get("user_id") == user_id
    if session.get("user_id") and not is_me:
        row = db.execute(
            "SELECT id FROM follow WHERE follower_id = %s AND followed_id = %s",
            (session["user_id"], user_id)).fetchone()
        is_following = row is not None
        friend_status = _friend_status(db, session["user_id"], user_id)

    return ok({
        "user": dict(user),
        "is_me": is_me,
        "is_following": is_following,
        "friend_status": friend_status,
        "post_count": post_count,
        "following_count": following_count,
        "follower_count": follower_count,
        "following_list": [dict(r) for r in following_list],
        "follower_list": [dict(r) for r in follower_list],
        "posts": [dict(p) for p in posts],
    })


@app.route("/api/users/me", methods=["PUT"])
@login_required
def api_edit_profile():
    data = request.get_json(silent=True) or request.form
    username = (data.get("username") or "").strip()
    nationality = (data.get("nationality") or "").strip()
    avatar = (data.get("avatar") or "").strip()
    bio = (data.get("bio") or "").strip()
    learning_interest = (data.get("learning_interest") or "").strip()
    db = get_db()
    # 修改用户名（唯一性校验；留空则不改）
    if username:
        if len(username) < 2 or len(username) > 20:
            return fail("用户名长度需为 2-20 个字符")
        dup = db.execute(
            'SELECT id FROM "user" WHERE username = %s AND id <> %s',
            (username, _current_user_id())).fetchone()
        if dup:
            return fail("用户名已存在，请更换")
        session["username"] = username
    db.execute(
        'UPDATE "user" SET username = COALESCE(NULLIF(%s, \'\'), username), '
        "nationality = %s, avatar = %s, bio = %s, learning_interest = %s "
        "WHERE id = %s",
        (username, nationality, avatar, bio, learning_interest, _current_user_id()))
    db.commit()
    return ok()


@app.route("/api/users/<int:user_id>/follow", methods=["POST", "DELETE"])
@login_required
def api_toggle_follow(user_id):
    if user_id == _current_user_id():
        return fail("不能关注自己")
    db = get_db()
    target = db.execute("SELECT id FROM \"user\" WHERE id = %s", (user_id,)).fetchone()
    if target is None:
        return fail("用户不存在", 404)
    existing = db.execute(
        "SELECT id FROM follow WHERE follower_id = %s AND followed_id = %s",
        (_current_user_id(), user_id)).fetchone()
    if request.method == "POST":
        if existing:
            return fail("已关注该用户")
        db.execute(
            "INSERT INTO follow (follower_id, followed_id, create_time) VALUES (%s, %s, %s)",
            (_current_user_id(), user_id, now()))
        db.commit()
        return ok({"following": True})
    else:
        if existing:
            db.execute("DELETE FROM follow WHERE id = %s", (existing["id"],))
            db.commit()
        return ok({"following": False})


# ---------------------------------------------------------------------------
# 好友
# ---------------------------------------------------------------------------
def _friend_status(db, me, other):
    if db.execute(
        "SELECT id FROM friend WHERE user_id = %s AND friend_id = %s",
        (me, other)).fetchone():
        return "friend"
    row = db.execute(
        "SELECT status FROM friend_request WHERE from_id = %s AND to_id = %s AND status='pending'",
        (me, other)).fetchone()
    if row:
        return "pending_sent"
    row = db.execute(
        "SELECT status FROM friend_request WHERE from_id = %s AND to_id = %s AND status='pending'",
        (other, me)).fetchone()
    if row:
        return "pending_received"
    return "none"


@app.route("/api/friends/requests", methods=["POST"])
@login_required
def api_add_friend():
    data = request.get_json(silent=True) or request.form
    try:
        to_id = int(data.get("user_id") or 0)
    except (TypeError, ValueError):
        to_id = 0
    if to_id == _current_user_id() or to_id == 0:
        return fail("无效的用户")
    db = get_db()
    target = db.execute("SELECT id FROM \"user\" WHERE id = %s", (to_id,)).fetchone()
    if target is None:
        return fail("用户不存在", 404)
    status = _friend_status(db, _current_user_id(), to_id)
    if status == "friend":
        return fail("你们已经是好友了")
    if status == "pending_sent":
        return fail("已发送过好友请求，等待对方确认")
    if status == "pending_received":
        return fail("对方已向你发送好友请求，请到好友请求页处理")
    db.execute(
        "INSERT INTO friend_request (from_id, to_id, status, create_time) "
        "VALUES (%s, %s, 'pending', %s)",
        (_current_user_id(), to_id, now()))
    me = db.execute("SELECT username FROM \"user\" WHERE id = %s", (_current_user_id(),)).fetchone()
    db.execute(
        "INSERT INTO message "
        "(msg_type, sender_id, receiver_id, content, link, is_read, create_time) "
        "VALUES ('system', %s, %s, %s, %s, 0, %s)",
        (_current_user_id(), to_id, f"{me['username']} 请求添加你为好友", "/friends/requests", now()))
    db.commit()
    return ok(), 201


@app.route("/api/friends/requests", methods=["GET"])
@login_required
def api_friend_requests():
    db = get_db()
    received = db.execute("""
        SELECT fr.*, u.username, u.avatar FROM friend_request fr
        JOIN "user" u ON fr.from_id = u.id
        WHERE fr.to_id = %s AND fr.status = 'pending' ORDER BY fr.create_time DESC
    """, (_current_user_id(),)).fetchall()
    sent = db.execute("""
        SELECT fr.*, u.username, u.avatar FROM friend_request fr
        JOIN "user" u ON fr.to_id = u.id
        WHERE fr.from_id = %s AND fr.status = 'pending' ORDER BY fr.create_time DESC
    """, (_current_user_id(),)).fetchall()
    return ok({"received": [dict(r) for r in received], "sent": [dict(r) for r in sent]})


@app.route("/api/friends/requests/<int:req_id>/accept", methods=["POST"])
@login_required
def api_accept_friend(req_id):
    db = get_db()
    req = db.execute("SELECT * FROM friend_request WHERE id = %s", (req_id,)).fetchone()
    if req is None or req["to_id"] != _current_user_id():
        return fail("请求不存在", 404)
    db.execute("INSERT INTO friend (user_id, friend_id, create_time) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
               (req["to_id"], req["from_id"], now()))
    db.execute("INSERT INTO friend (user_id, friend_id, create_time) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
               (req["from_id"], req["to_id"], now()))
    db.execute("DELETE FROM friend_request WHERE id = %s", (req_id,))
    me = db.execute("SELECT username FROM \"user\" WHERE id = %s", (_current_user_id(),)).fetchone()
    db.execute(
        "INSERT INTO message "
        "(msg_type, sender_id, receiver_id, content, link, is_read, create_time) "
        "VALUES ('system', %s, %s, %s, %s, 0, %s)",
        (_current_user_id(), req["from_id"], f"{me['username']} 已接受你的好友请求", "/chat", now()))
    db.commit()
    return ok()


@app.route("/api/friends/requests/<int:req_id>/reject", methods=["POST"])
@login_required
def api_reject_friend(req_id):
    db = get_db()
    req = db.execute("SELECT * FROM friend_request WHERE id = %s", (req_id,)).fetchone()
    if req is None or req["to_id"] != _current_user_id():
        return fail("请求不存在", 404)
    db.execute("DELETE FROM friend_request WHERE id = %s", (req_id,))
    db.commit()
    return ok()


@app.route("/api/friends/<int:friend_id>", methods=["DELETE"])
@login_required
def api_remove_friend(friend_id):
    db = get_db()
    db.execute("DELETE FROM friend WHERE user_id = %s AND friend_id = %s",
               (_current_user_id(), friend_id))
    db.execute("DELETE FROM friend WHERE user_id = %s AND friend_id = %s",
               (friend_id, _current_user_id()))
    db.commit()
    return ok()


# ---------------------------------------------------------------------------
# SSE 实时推送（内存发布订阅，进程内有效；聊天私信即时推送）
# ---------------------------------------------------------------------------
_SSE_HUBS = {}            # user_id -> set[queue.Queue]
_SSE_LOCK = threading.Lock()


def _sse_subscribe(user_id):
    """注册一个订阅队列，返回 (queue, unsubscribe)"""
    q = queue.Queue(maxsize=100)
    with _SSE_LOCK:
        _SSE_HUBS.setdefault(user_id, set()).add(q)

    def _unsub():
        with _SSE_LOCK:
            s = _SSE_HUBS.get(user_id)
            if s:
                s.discard(q)
                if not s:
                    _SSE_HUBS.pop(user_id, None)

    return q, _unsub


def _sse_notify(user_id, payload: dict):
    """向指定用户的所有活跃订阅推送一条 JSON 事件（队列满则丢弃，不阻塞写请求）"""
    if user_id is None:
        return
    with _SSE_LOCK:
        for q in tuple(_SSE_HUBS.get(user_id, ())):
            try:
                q.put_nowait(payload)
            except queue.Full:
                pass


def _sse_event(payload: dict) -> str:
    """将事件序列化为 SSE data 帧"""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.route("/api/chat/stream")
@login_required
def api_chat_stream():
    """SSE 实时推送流：该用户收到新私信时立即推送；空闲 15s 发心跳保活"""
    me = _current_user_id()
    q, unsub = _sse_subscribe(me)

    def gen():
        try:
            yield _sse_event({"type": "hello", "ts": now()})
            while True:
                try:
                    payload = q.get(timeout=15)
                except queue.Empty:
                    yield ": ping\n\n"  # 心跳注释行（EventSource 忽略）
                    continue
                yield _sse_event(payload)
        finally:
            unsub()

    resp = app.response_class(gen(), mimetype="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"  # 让 Nginx 不缓冲该流
    return resp


# ---------------------------------------------------------------------------
# 聊天 / 消息
# ---------------------------------------------------------------------------
@app.route("/api/chat")
@login_required
def api_chat():
    db = get_db()
    friends = db.execute("""
        SELECT u.id, u.username, u.avatar, u.bio,
               (u.last_active IS NOT NULL AND u.last_active > now() - interval '2 minutes') AS is_online
        FROM friend f JOIN "user" u ON f.friend_id = u.id
        WHERE f.user_id = %s ORDER BY u.username
    """, (_current_user_id(),)).fetchall()
    unread_map = {}
    rows = db.execute(
        "SELECT sender_id, COUNT(*) AS c FROM message "
        "WHERE receiver_id = %s AND msg_type = 'private' AND is_read = 0 "
        "GROUP BY sender_id", (_current_user_id(),)).fetchall()
    for r in rows:
        unread_map[r["sender_id"]] = r["c"]
    recents = db.execute("""
        SELECT m.*, su.username AS sender_name, su.avatar AS sender_avatar,
               ru.username AS receiver_name, ru.avatar AS receiver_avatar
        FROM message m
        LEFT JOIN "user" su ON m.sender_id = su.id
        LEFT JOIN "user" ru ON m.receiver_id = ru.id
        WHERE (m.receiver_id = %s OR m.sender_id = %s) AND m.msg_type = 'private'
        ORDER BY m.create_time DESC, m.id DESC
    """, (_current_user_id(), _current_user_id())).fetchall()
    convos, seen = [], set()
    for m in recents:
        other = m["sender_id"] if m["receiver_id"] == _current_user_id() else m["receiver_id"]
        if other is None or other in seen:
            continue
        seen.add(other)
        mine = m["sender_id"] == _current_user_id()
        other_online = db.execute(
            "SELECT (last_active IS NOT NULL AND last_active > now() - interval '2 minutes') AS o "
            "FROM \"user\" WHERE id = %s", (other,)).fetchone()
        convos.append({
            "other_id": other,
            "other_name": (m["sender_name"] if not mine else m["receiver_name"]) or "已注销",
            "other_avatar": (m["sender_avatar"] if not mine else m["receiver_avatar"]) or "",
            "other_is_online": bool(other_online and other_online["o"]),
            "content": m["content"], "time": m["create_time"],
            "mine": mine,
            "unread": unread_map.get(other, 0),
        })
    return ok({"friends": [dict(f) for f in friends], "convos": convos})


@app.route("/api/chat/<int:user_id>")
@login_required
def api_chat_detail(user_id):
    db = get_db()
    other = db.execute(
        "SELECT id, username, avatar, bio FROM \"user\" WHERE id = %s", (user_id,)).fetchone()
    if other is None:
        return fail("用户不存在", 404)
    msgs = db.execute("""
        SELECT m.*, u.username AS sender_name, u.avatar AS sender_avatar FROM message m
        LEFT JOIN "user" u ON m.sender_id = u.id
        WHERE ((m.sender_id = %s AND m.receiver_id = %s)
               OR (m.sender_id = %s AND m.receiver_id = %s))
          AND m.msg_type = 'private'
        ORDER BY m.create_time ASC, m.id ASC
    """, (_current_user_id(), user_id, user_id, _current_user_id())).fetchall()
    db.execute("UPDATE message SET is_read = 1 "
               "WHERE receiver_id = %s AND sender_id = %s AND msg_type = 'private'",
               (_current_user_id(), user_id))
    db.commit()
    return ok({
        "other": dict(other),
        "msgs": [dict(m) for m in msgs],
    })


@app.route("/api/chat/<int:user_id>/send", methods=["POST"])
@login_required
def api_chat_send(user_id):
    data = request.get_json(silent=True) or request.form
    content = (data.get("content") or "").strip()
    if not content:
        return fail("消息内容不能为空")
    db = get_db()
    other = db.execute("SELECT id FROM \"user\" WHERE id = %s", (user_id,)).fetchone()
    if other is None:
        return fail("用户不存在", 404)
    friend = db.execute(
        "SELECT id FROM friend WHERE user_id = %s AND friend_id = %s",
        (_current_user_id(), user_id)).fetchone()
    if not friend:
        return fail("仅好友之间可以聊天，请先添加好友", 403)
    cur = db.execute(
        "INSERT INTO message "
        "(msg_type, sender_id, receiver_id, content, link, is_read, create_time) "
        "VALUES ('private', %s, %s, %s, '', 0, %s) RETURNING create_time",
        (_current_user_id(), user_id, content, now()))
    row = cur.fetchone()
    db.commit()
    # SSE 实时推送：接收方即时收到，发送方其他标签页同步
    for target in (user_id, _current_user_id()):
        _sse_notify(target, {
            "type": "message",
            "sender_id": _current_user_id(),
            "receiver_id": user_id,
            "content": content,
            "create_time": row["create_time"] if row else now(),
        })
    return ok(), 201


@app.route("/api/messages")
@login_required
def api_messages():
    db = get_db()
    systems = db.execute("""
        SELECT m.*, su.username AS sender_name, su.avatar AS sender_avatar FROM message m
        LEFT JOIN "user" su ON m.sender_id = su.id
        WHERE m.receiver_id = %s AND m.msg_type = 'system'
        ORDER BY m.create_time DESC, m.id DESC LIMIT 200
    """, (_current_user_id(),)).fetchall()
    db.execute("UPDATE message SET is_read = 1 "
               "WHERE receiver_id = %s AND msg_type = 'system'",
               (_current_user_id(),))
    db.commit()
    return ok([dict(m) for m in systems])


# ---------------------------------------------------------------------------
# 上传
# ---------------------------------------------------------------------------
@app.route("/api/upload", methods=["POST"])
@login_required
def api_upload():
    f = request.files.get("file")
    if f is None or not f.filename:
        return fail("未选择文件")
    ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
    if ext in ALLOWED_IMG_EXT:
        max_size = MAX_IMG_SIZE
    elif ext in ALLOWED_VIDEO_EXT:
        max_size = MAX_VIDEO_SIZE
    else:
        return fail("不支持的文件类型：图片(jpg/png/gif/webp)或视频(mp4/webm/ogg/mov/mkv)")
    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    if size > max_size:
        return fail(f"文件过大，上限 {max_size // 1024 // 1024}MB")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    fname = f"{uuid.uuid4().hex}.{ext}"
    f.save(os.path.join(UPLOAD_DIR, fname))
    return ok({"url": f"/uploads/{fname}"})


@app.route("/uploads/<path:filename>")
def _uploads(filename):
    from flask import send_from_directory
    return send_from_directory(UPLOAD_DIR, filename)


# ---------------------------------------------------------------------------
# 学术匹配 / LLM
# ---------------------------------------------------------------------------
@app.route("/api/match")
@login_required
def api_match():
    db = get_db()
    user = db.execute(
        "SELECT learning_interest FROM \"user\" WHERE id = %s", (_current_user_id(),)).fetchone()
    llm_cfg = db.execute(
        "SELECT base_url, api_key, model FROM user_llm_config WHERE user_id = %s",
        (_current_user_id(),)).fetchone()
    llm_ready = bool(llm_cfg and llm_cfg["api_key"] and llm_cfg["base_url"])
    return ok({
        "default_interest": user["learning_interest"] if user else "",
        "llm_ready": llm_ready,
        "llm_model": (llm_cfg["model"] if llm_ready else ""),
        "mcp_ready": True,      # 文献检索走 OpenAlex 免费源，无需配置
    })


@app.route("/api/match/search", methods=["POST"])
@login_required
def api_match_search():
    data = request.get_json(silent=True) or request.form
    keyword = (data.get("keyword") or "").strip()
    use_interest = data.get("use_interest") in (True, "on", "1", "true")
    llm_on = data.get("use_llm") in (True, "on", "1", "true")
    if not keyword:
        return fail("请输入检索关键词")
    db = get_db()
    learning_interest = ""
    if use_interest:
        row = db.execute(
            "SELECT learning_interest FROM \"user\" WHERE id = %s", (_current_user_id(),)).fetchone()
        learning_interest = row["learning_interest"] if row else ""
        if learning_interest and keyword != learning_interest:
            keyword = f"{keyword} {learning_interest}"
    # 文献检索：OpenAlex 免费源（无需 Key / 企业认证）
    try:
        literature = search_openalex(keyword, limit=10)
    except RuntimeError as exc:
        return fail(f"文献检索失败: {exc}", 502)
    results = {
        "patents": [],
        "literature": literature,
        "patents_raw": "",
        "literature_raw": "",
        "tools_found": {"patent": [], "literature": ["OpenAlex"], "other": []},
        "errors": [],
    }
    total = len(literature)
    summary = ""
    llm_error = ""
    if llm_on:
        cfg = db.execute(
            "SELECT base_url, api_key, model FROM user_llm_config WHERE user_id = %s",
            (_current_user_id(),)).fetchone()
        if cfg and cfg["api_key"]:
            try:
                summary = analyze_matches(
                    cfg["api_key"], cfg["base_url"], cfg["model"],
                    learning_interest or keyword, results)
            except RuntimeError as exc:
                llm_error = str(exc)
        else:
            llm_error = "未配置LLM API，已跳过智能分析"
    import json
    search_id = save_search(db, _current_user_id(), keyword, total, summary)
    db.execute("UPDATE academic_search SET results_json = %s WHERE id = %s",
               (json.dumps(results, ensure_ascii=False), search_id))
    db.commit()
    return ok({"search_id": search_id, "llm_error": llm_error, "total": total})


@app.route("/api/match/result/<int:search_id>")
@login_required
def api_match_result(search_id):
    import json
    db = get_db()
    record = db.execute(
        "SELECT * FROM academic_search WHERE id = %s AND user_id = %s",
        (search_id, _current_user_id())).fetchone()
    if record is None:
        return fail("记录不存在", 404)
    try:
        results = json.loads(record["results_json"] or "{}")
    except json.JSONDecodeError:
        results = {}
    return ok({
        "record": dict(record),
        "patents": results.get("patents", []),
        "literature": results.get("literature", []),
        "patents_raw": results.get("patents_raw", ""),
        "literature_raw": results.get("literature_raw", ""),
        "tools_found": results.get("tools_found", {}),
        "errors": results.get("errors", []),
        "summary": record["summary"],
    })


@app.route("/api/match/history")
@login_required
def api_match_history():
    db = get_db()
    records = db.execute(
        "SELECT id, keyword, result_count, create_time FROM academic_search "
        "WHERE user_id = %s ORDER BY create_time DESC", (_current_user_id(),)).fetchall()
    return ok([dict(r) for r in records])


@app.route("/api/settings/llm", methods=["GET", "POST"])
@login_required
def api_settings_llm():
    db = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or request.form
        base_url = (data.get("base_url") or "").strip()
        api_key = (data.get("api_key") or "").strip()
        model = (data.get("model") or "").strip()
        if not base_url or not api_key or not model:
            return fail("base_url、api_key、model 均不能为空")
        exists = db.execute(
            "SELECT id FROM user_llm_config WHERE user_id = %s", (_current_user_id(),)).fetchone()
        if exists:
            db.execute(
                "UPDATE user_llm_config SET base_url = %s, api_key = %s, model = %s, "
                "update_time = %s WHERE user_id = %s",
                (base_url, api_key, model, now(), _current_user_id()))
        else:
            db.execute(
                "INSERT INTO user_llm_config "
                "(user_id, base_url, api_key, model, create_time, update_time) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (_current_user_id(), base_url, api_key, model, now(), now()))
        db.commit()
        return ok()
    cfg = db.execute(
        "SELECT base_url, api_key, model FROM user_llm_config WHERE user_id = %s",
        (_current_user_id(),)).fetchone()
    payload = {"base_url": "", "model": "", "configured": False}
    if cfg and cfg["api_key"]:
        payload = {
            "base_url": cfg["base_url"], "model": cfg["model"],
            "configured": True,
            # 密钥脱敏
            "api_key_masked": (cfg["api_key"][:6] + "••••" if len(cfg["api_key"]) > 6 else "••••"),
        }
    return ok(payload)


@app.route("/api/settings/llm/test", methods=["POST"])
@login_required
def api_llm_test():
    data = request.get_json(silent=True) or request.form
    base_url = (data.get("base_url") or "").strip()
    api_key = (data.get("api_key") or "").strip()
    model = (data.get("model") or "").strip()
    if not base_url or not api_key or not model:
        return fail("base_url、api_key、model 均不能为空")
    try:
        reply = llm_chat(base_url, api_key, model,
                         [{"role": "user", "content": "请回复：连接成功"}])
        return ok({"reply": (reply or "")[:200]})
    except RuntimeError as exc:
        return fail(f"连接失败: {exc}", 502)


# ---------------------------------------------------------------------------
# 账号注销
# ---------------------------------------------------------------------------
@app.route("/api/auth/delete", methods=["POST"])
@login_required
def api_delete_account():
    """注销当前账号：级联删除其全部关联数据后删除用户，并清除会话"""
    uid = _current_user_id()
    db = get_db()
    db.execute("DELETE FROM comment WHERE user_id = %s", (uid,))
    db.execute("DELETE FROM post WHERE user_id = %s", (uid,))
    db.execute("DELETE FROM follow WHERE follower_id = %s OR followed_id = %s", (uid, uid))
    db.execute("DELETE FROM message WHERE sender_id = %s OR receiver_id = %s", (uid, uid))
    db.execute("DELETE FROM friend WHERE user_id = %s OR friend_id = %s", (uid, uid))
    db.execute("DELETE FROM friend_request WHERE from_id = %s OR to_id = %s", (uid, uid))
    db.execute("DELETE FROM user_llm_config WHERE user_id = %s", (uid,))
    db.execute("DELETE FROM academic_search WHERE user_id = %s", (uid,))
    db.execute('DELETE FROM "user" WHERE id = %s', (uid,))
    db.commit()
    session.clear()
    return ok()


# ---------------------------------------------------------------------------
# 公告（管理员发布，全站可见）
# ---------------------------------------------------------------------------
@app.route("/api/announcements")
def api_announcements():
    """公告列表（公开，按时间倒序，最多 20 条，含发布者信息）"""
    db = get_db()
    rows = db.execute("""
        SELECT a.*, u.username AS publisher_username, u.avatar AS publisher_avatar,
               u.role AS publisher_role
        FROM announcement a
        LEFT JOIN "user" u ON a.user_id = u.id
        ORDER BY a.create_time DESC, a.id DESC LIMIT 20
    """).fetchall()
    return ok([dict(r) for r in rows])


@app.route("/api/announcements", methods=["POST"])
@admin_required
def api_create_announcement():
    data = request.get_json(silent=True) or request.form
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title or not content:
        return fail("公告标题和内容不能为空")
    db = get_db()
    cur = db.execute(
        "INSERT INTO announcement (user_id, title, content, create_time) "
        "VALUES (%s, %s, %s, %s) RETURNING id",
        (_current_user_id(), title, content, now()))
    db.commit()
    return ok({"id": cur.fetchone()["id"]}), 201


@app.route("/api/announcements/<int:aid>", methods=["DELETE"])
@admin_required
def api_delete_announcement(aid):
    db = get_db()
    db.execute("DELETE FROM announcement WHERE id = %s", (aid,))
    db.commit()
    return ok()


# ---------------------------------------------------------------------------
# 管理后台（管理员）
# ---------------------------------------------------------------------------
@app.route("/api/admin/users")
@admin_required
def api_admin_users():
    """用户列表（管理员用，可按用户名搜索）"""
    q = (request.args.get("q") or "").strip()
    db = get_db()
    if q:
        rows = db.execute(
            'SELECT id, username, avatar, role, create_time FROM "user" '
            "WHERE username LIKE %s ORDER BY id LIMIT 50",
            (f"%{q}%",)).fetchall()
    else:
        rows = db.execute(
            'SELECT id, username, avatar, role, create_time FROM "user" '
            "ORDER BY id LIMIT 100").fetchall()
    return ok([dict(r) for r in rows])


@app.route("/api/admin/users/<int:target_id>/role", methods=["POST"])
@admin_required
def api_set_user_role(target_id):
    """设置/取消管理员角色（不能修改自己的角色）"""
    data = request.get_json(silent=True) or request.form
    role = (data.get("role") or "").strip()
    if role not in ("admin", "user"):
        return fail("无效角色")
    if target_id == _current_user_id():
        return fail("不能修改自己的角色")
    db = get_db()
    target = db.execute('SELECT id FROM "user" WHERE id = %s', (target_id,)).fetchone()
    if target is None:
        return fail("用户不存在", 404)
    db.execute('UPDATE "user" SET role = %s WHERE id = %s', (role, target_id))
    db.commit()
    # 实时推送角色变更，目标用户在线时前端立即刷新（无需等待轮询）
    _sse_notify(target_id, {"type": "role_changed", "role": role})
    return ok()


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    debug = os.environ.get("FLASK_DEBUG") == "1"  # Docker 生产默认关闭调试
    app.run(host="0.0.0.0", port=5000, debug=debug)
