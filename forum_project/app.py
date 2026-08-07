"""
轻量化本地论坛系统 - Flask + SQLite3 单文件后端
=============================================
遵循 flask_sqlite_forum_dev 技能规范 v1.0.0
数据库: SQLite3 (forum.db) | 模板: Jinja2 | 依赖: flask==2.3.3
"""

import sqlite3
import os
import re
import uuid
from datetime import datetime

from flask import (
    Flask, render_template, request, redirect,
    url_for, session, flash, g, jsonify
)

from academic_match import (
    PatsnapMCPClient, mcp_configured, get_patsnap_mcp_key,
    get_patsnap_mcp_url, llm_chat, analyze_matches,
    save_search, DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL,
)

# ---------------------------------------------------------------------------
# App 初始化
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.urandom(24).hex()  # session 签名密钥

# 数据库路径（固定为项目根目录下的 forum.db）
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "forum.db")


# ---------------------------------------------------------------------------
# 极简 Markdown 渲染（LLM 返回的匹配分析为 Markdown 格式）
# 零依赖：先 HTML 转义防注入，再按行渲染常见语法（标题/列表/代码/引用/链接）
# ---------------------------------------------------------------------------
def md_to_html(text: str) -> str:
    """将 Markdown 文本渲染为安全的 HTML（未匹配语法保持为转义后的纯文本）"""
    import re as _re
    import html as _html

    def _esc(s: str) -> str:
        return _html.escape(s, quote=True)

    def _inline(s: str) -> str:
        # 行内代码
        s = _re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        # 图片 ![alt](url)：视频扩展名渲染为 <video>，其余渲染为 <img>
        def _img(m):
            alt, u = m.group(1), m.group(2)
            if not (_re.match(r"^https?://", u) or u.startswith("/")):
                return m.group(0)
            if _re.search(r"\.(mp4|webm|ogg|mov|mkv)(\?|#|$)", u.lower()):
                return ('<video controls preload="metadata" '
                        'style="max-width:100%;border-radius:8px;margin:8px 0;">'
                        f'<source src="{u}"></video>')
            return (f'<img src="{u}" alt="{_esc(alt)}" loading="lazy" '
                    'style="max-width:100%;border-radius:8px;margin:8px 0;">')
        s = _re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)", _img, s)
        # 链接 [text](url)，放行 http/https 与站内相对路径(/开头)，防止 javascript: 注入
        def _link(m):
            t, u = m.group(1), m.group(2)
            if u.startswith("/"):
                return '<a href="{}">{}</a>'.format(u, t)
            if not _re.match(r"^https?://", u):
                return m.group(0)
            return '<a href="{}" target="_blank" rel="noopener">{}</a>'.format(u, t)
        s = _re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", _link, s)
        # 加粗 / 斜体（负向断言避免误伤 **bold**）
        s = _re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
        s = _re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<em>\1</em>", s)
        return s

    lines = text.splitlines()
    out, i, n = [], 0, len(lines)
    while i < n:
        stripped = lines[i].strip()
        # 代码块
        if stripped.startswith("```"):
            buf = []
            i += 1
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1  # 跳过闭合 ```
            out.append("<pre>" + _esc("\n".join(buf)) + "</pre>")
            continue
        if not stripped:
            out.append("")
            i += 1
            continue
        if stripped in ("---", "***", "___"):
            out.append("<hr>")
            i += 1
            continue
        m = _re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            lvl = len(m.group(1))
            out.append("<h{0}>{1}</h{0}>".format(lvl, _inline(_esc(m.group(2)))))
            i += 1
            continue
        if stripped.startswith(">"):
            out.append("<blockquote>" + _inline(_esc(_re.sub(r"^>\s?", "", stripped))) + "</blockquote>")
            i += 1
            continue
        # 无序列表（连续项聚合为一个 <ul>）
        if _re.match(r"^[-*+]\s+", stripped):
            items = []
            while i < n:
                s = lines[i].strip()
                if _re.match(r"^[-*+]\s+", s):
                    items.append("<li>" + _inline(_esc(_re.sub(r"^[-*+]\s+", "", s))) + "</li>")
                    i += 1
                else:
                    break
            out.append("<ul>" + "".join(items) + "</ul>")
            continue
        # 有序列表（连续项聚合为一个 <ol>）
        if _re.match(r"^\d+[.)]\s+", stripped):
            items = []
            while i < n:
                s = lines[i].strip()
                if _re.match(r"^\d+[.)]\s+", s):
                    items.append("<li>" + _inline(_esc(_re.sub(r"^\d+[.)]\s+", "", s))) + "</li>")
                    i += 1
                else:
                    break
            out.append("<ol>" + "".join(items) + "</ol>")
            continue
        out.append("<p>" + _inline(_esc(stripped)) + "</p>")
        i += 1
    return "\n".join(out)


app.add_template_filter(md_to_html, "md")


# ---------------------------------------------------------------------------
# 数据库连接管理（每个请求独立连接，请求结束后自动关闭）
# ---------------------------------------------------------------------------
def get_db() -> sqlite3.Connection:
    """获取当前请求的数据库连接（行工厂 -> sqlite3.Row，支持字段名访问）"""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")  # 开启外键级联
    return g.db


@app.teardown_appcontext
def close_db(exception):
    """请求结束后关闭数据库连接"""
    db = g.pop("db", None)
    if db is not None:
        db.close()


# ---------------------------------------------------------------------------
# 初始化数据库表（启动时自动调用）
# ---------------------------------------------------------------------------
def init_db():
    """创建三张强制表 + follow表 + 用户profile字段迁移"""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS user (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT    NOT NULL UNIQUE,
            password    TEXT    NOT NULL,
            create_time TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS post (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            title       TEXT    NOT NULL,
            content     TEXT    NOT NULL,
            create_time TEXT    NOT NULL,
            update_time TEXT    NOT NULL,
            FOREIGN KEY (user_id) REFERENCES user(id)
        );

        CREATE TABLE IF NOT EXISTS comment (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id     INTEGER NOT NULL,
            user_id     INTEGER NOT NULL,
            content     TEXT    NOT NULL,
            create_time TEXT    NOT NULL,
            FOREIGN KEY (post_id)  REFERENCES post(id)  ON DELETE CASCADE,
            FOREIGN KEY (user_id)  REFERENCES user(id)
        );

        CREATE TABLE IF NOT EXISTS follow (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            follower_id INTEGER NOT NULL,
            followed_id INTEGER NOT NULL,
            create_time TEXT    NOT NULL,
            UNIQUE(follower_id, followed_id),
            FOREIGN KEY (follower_id) REFERENCES user(id),
            FOREIGN KEY (followed_id) REFERENCES user(id)
        );

        CREATE TABLE IF NOT EXISTS user_llm_config (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL UNIQUE,
            base_url    TEXT    NOT NULL DEFAULT '',
            api_key     TEXT    NOT NULL DEFAULT '',
            model       TEXT    NOT NULL DEFAULT '',
            create_time TEXT    NOT NULL,
            update_time TEXT    NOT NULL,
            FOREIGN KEY (user_id) REFERENCES user(id)
        );

        CREATE TABLE IF NOT EXISTS academic_search (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL,
            keyword      TEXT    NOT NULL,
            result_count INTEGER NOT NULL DEFAULT 0,
            summary      TEXT    NOT NULL DEFAULT '',
            results_json TEXT    NOT NULL DEFAULT '',
            create_time  TEXT    NOT NULL,
            FOREIGN KEY (user_id) REFERENCES user(id)
        );

        CREATE TABLE IF NOT EXISTS message (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            msg_type    TEXT    NOT NULL DEFAULT 'private',  -- private=私信 / system=系统通知
            sender_id   INTEGER,
            receiver_id INTEGER NOT NULL,
            content     TEXT    NOT NULL,
            link        TEXT    NOT NULL DEFAULT '',
            is_read     INTEGER NOT NULL DEFAULT 0,
            create_time TEXT    NOT NULL,
            FOREIGN KEY (sender_id)   REFERENCES user(id),
            FOREIGN KEY (receiver_id) REFERENCES user(id)
        );

        CREATE TABLE IF NOT EXISTS friend (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            friend_id   INTEGER NOT NULL,
            create_time TEXT    NOT NULL,
            UNIQUE(user_id, friend_id),
            FOREIGN KEY (user_id)   REFERENCES user(id),
            FOREIGN KEY (friend_id) REFERENCES user(id)
        );

        CREATE TABLE IF NOT EXISTS friend_request (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            from_id     INTEGER NOT NULL,
            to_id       INTEGER NOT NULL,
            status      TEXT    NOT NULL DEFAULT 'pending',
            create_time TEXT    NOT NULL,
            UNIQUE(from_id, to_id),
            FOREIGN KEY (from_id) REFERENCES user(id),
            FOREIGN KEY (to_id)   REFERENCES user(id)
        );
    """)
    # 迁移：为已有 user 表追加 profile 字段（如已存在则忽略）
    for col in ["avatar", "bio", "learning_interest"]:
        try:
            conn.execute(
                f"ALTER TABLE user ADD COLUMN {col} TEXT NOT NULL DEFAULT ''"
            )
        except sqlite3.OperationalError:
            pass
    # 迁移：为已有 academic_search 表追加结果字段
    try:
        conn.execute(
            "ALTER TABLE academic_search "
            "ADD COLUMN results_json TEXT NOT NULL DEFAULT ''"
        )
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------
def now() -> str:
    """返回当前时间字符串 YYYY-MM-DD HH:MM:SS"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------------
# 文件上传配置（发帖/评论中的图片、视频）
# ---------------------------------------------------------------------------
UPLOAD_DIR = os.path.join(BASE_DIR, "static", "uploads")
ALLOWED_IMG_EXT = {"jpg", "jpeg", "png", "gif", "webp", "bmp"}
ALLOWED_VIDEO_EXT = {"mp4", "webm", "ogg", "mov", "mkv"}
MAX_IMG_SIZE = 5 * 1024 * 1024        # 图片上限 5MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024    # 视频上限 100MB


@app.context_processor
def inject_now():
    """将 now() 函数注入所有模板上下文，供 base.html 页尾使用"""
    return {"now": datetime.now}


@app.context_processor
def inject_unread():
    """注入当前用户信件箱未读数（base.html 导航徽标）"""
    if "user_id" not in session:
        return {"unread_count": 0}
    db = get_db()
    row = db.execute(
        "SELECT COUNT(*) AS c FROM message WHERE receiver_id = ? AND is_read = 0",
        (session["user_id"],)
    ).fetchone()
    return {"unread_count": row["c"] if row else 0}


def login_required(f):
    """登录拦截装饰器：未登录用户跳转首页并提示"""
    from functools import wraps

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            flash("请先登录", "warning")
            return redirect(url_for("index"))
        return f(*args, **kwargs)

    return decorated_function


# ===========================================================================
# 路由 - 用户模块
# ===========================================================================

@app.route("/")
def index():
    """首页：按时间倒序展示所有帖子，附带作者名和评论数"""
    db = get_db()
    rows = db.execute("""
        SELECT p.id, p.title, p.content, p.create_time,
               u.id AS user_id, u.username
        FROM post p
        JOIN user u ON p.user_id = u.id
        ORDER BY p.create_time DESC
    """).fetchall()
    # 为每个帖子附加评论计数
    posts = []
    for r in rows:
        count = db.execute(
            "SELECT COUNT(*) AS cnt FROM comment WHERE post_id = ?",
            (r["id"],)
        ).fetchone()["cnt"]
        posts.append({**r, "comment_count": count})
    return render_template("index.html", posts=posts)


@app.route("/search")
def search():
    """搜索：关键字匹配帖子标题/内容 + 用户名"""
    q = request.args.get("q", "").strip()
    posts, users = [], []
    if q:
        like = f"%{q}%"
        db = get_db()
        posts = db.execute("""
            SELECT p.id, p.title, p.content, p.create_time,
                   u.id AS user_id, u.username,
                   (SELECT COUNT(*) FROM comment c WHERE c.post_id = p.id) AS comment_count
            FROM post p
            JOIN user u ON p.user_id = u.id
            WHERE p.title LIKE ? OR p.content LIKE ?
            ORDER BY p.create_time DESC
        """, (like, like)).fetchall()
        users = db.execute(
            "SELECT id, username, avatar, bio FROM user "
            "WHERE username LIKE ? ORDER BY id LIMIT 50",
            (like,)
        ).fetchall()
    return render_template("search.html", q=q, posts=posts, users=users)


@app.route("/register", methods=["GET", "POST"])
def register():
    """用户注册：唯一用户名 + 非空校验"""
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()

        # 非空校验
        if not username or not password:
            flash("用户名和密码不能为空", "danger")
            return render_template("register.html")

        db = get_db()
        # 用户名唯一性校验
        exists = db.execute(
            "SELECT id FROM user WHERE username = ?", (username,)
        ).fetchone()
        if exists:
            flash("用户名已存在，请更换", "danger")
            return render_template("register.html")

        # 创建用户
        db.execute(
            "INSERT INTO user (username, password, create_time) VALUES (?, ?, ?)",
            (username, password, now())
        )
        db.commit()
        flash("注册成功，请登录", "success")
        return redirect(url_for("login"))

    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    """用户登录：校验账号密码，写入 session"""
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()

        if not username or not password:
            flash("用户名和密码不能为空", "danger")
            return render_template("login.html")

        db = get_db()
        user = db.execute(
            "SELECT id, username FROM user WHERE username = ? AND password = ?",
            (username, password)
        ).fetchone()

        if user is None:
            flash("用户名或密码错误", "danger")
            return render_template("login.html")

        # 写入 session
        session["user_id"] = user["id"]
        session["username"] = user["username"]
        flash(f"欢迎回来，{user['username']}！", "success")
        return redirect(url_for("index"))

    return render_template("login.html")


@app.route("/logout")
def logout():
    """退出登录：清空 session 并跳转首页"""
    session.clear()
    flash("已退出登录", "info")
    return redirect(url_for("index"))


# ===========================================================================
# 路由 - 用户资料 & 关注模块
# ===========================================================================

@app.route("/profile/<int:user_id>")
def profile(user_id):
    """用户资料页：展示头像/用户名/签名/学习意向/关注/粉丝/帖子"""
    db = get_db()
    user = db.execute(
        "SELECT id, username, avatar, bio, learning_interest, create_time "
        "FROM user WHERE id = ?", (user_id,)
    ).fetchone()
    if user is None:
        flash("用户不存在", "danger")
        return redirect(url_for("index"))

    # 统计
    post_count = db.execute(
        "SELECT COUNT(*) AS cnt FROM post WHERE user_id = ?", (user_id,)
    ).fetchone()["cnt"]

    # 我的关注数
    following_count = db.execute(
        "SELECT COUNT(*) AS cnt FROM follow WHERE follower_id = ?", (user_id,)
    ).fetchone()["cnt"]

    # 我的粉丝数
    follower_count = db.execute(
        "SELECT COUNT(*) AS cnt FROM follow WHERE followed_id = ?", (user_id,)
    ).fetchone()["cnt"]

    # 关注列表（我关注了谁）
    following_list = db.execute("""
        SELECT u.id, u.username FROM follow f
        JOIN user u ON f.followed_id = u.id
        WHERE f.follower_id = ?
        ORDER BY f.create_time DESC
    """, (user_id,)).fetchall()

    # 粉丝列表（谁关注了我）
    follower_list = db.execute("""
        SELECT u.id, u.username FROM follow f
        JOIN user u ON f.follower_id = u.id
        WHERE f.followed_id = ?
        ORDER BY f.create_time DESC
    """, (user_id,)).fetchall()

    # 当前登录用户是否已关注该用户
    is_following = False
    friend_status = "none"
    if "user_id" in session and session["user_id"] != user_id:
        row = db.execute(
            "SELECT id FROM follow WHERE follower_id = ? AND followed_id = ?",
            (session["user_id"], user_id)
        ).fetchone()
        is_following = row is not None
        friend_status = _friend_status(db, session["user_id"], user_id)

    # 该用户最近的帖子
    posts = db.execute("""
        SELECT id, title, create_time FROM post
        WHERE user_id = ?
        ORDER BY create_time DESC LIMIT 20
    """, (user_id,)).fetchall()

    return render_template(
        "profile.html",
        profile_user=user,
        post_count=post_count,
        following_count=following_count,
        follower_count=follower_count,
        following_list=following_list,
        follower_list=follower_list,
        is_following=is_following,
        friend_status=friend_status,
        posts=posts,
    )


@app.route("/profile/edit", methods=["GET", "POST"])
@login_required
def edit_profile():
    """编辑个人资料：头像/签名/学习意向"""
    db = get_db()

    if request.method == "POST":
        avatar = request.form.get("avatar", "").strip()
        bio = request.form.get("bio", "").strip()
        learning_interest = request.form.get("learning_interest", "").strip()

        db.execute(
            "UPDATE user SET avatar = ?, bio = ?, learning_interest = ? WHERE id = ?",
            (avatar, bio, learning_interest, session["user_id"])
        )
        db.commit()
        flash("个人资料已更新", "success")
        return redirect(url_for("profile", user_id=session["user_id"]))

    user = db.execute(
        "SELECT avatar, bio, learning_interest FROM user WHERE id = ?",
        (session["user_id"],)
    ).fetchone()
    return render_template("edit_profile.html", user=user)


@app.route("/follow/<int:user_id>", methods=["POST"])
@login_required
def toggle_follow(user_id):
    """关注/取消关注用户"""
    if user_id == session["user_id"]:
        flash("不能关注自己", "warning")
        return redirect(url_for("profile", user_id=user_id))

    db = get_db()
    # 检查目标用户是否存在
    target = db.execute(
        "SELECT id FROM user WHERE id = ?", (user_id,)
    ).fetchone()
    if target is None:
        flash("用户不存在", "danger")
        return redirect(url_for("index"))

    # 检查是否已关注
    existing = db.execute(
        "SELECT id FROM follow WHERE follower_id = ? AND followed_id = ?",
        (session["user_id"], user_id)
    ).fetchone()

    if existing:
        db.execute("DELETE FROM follow WHERE id = ?", (existing["id"],))
        db.commit()
        flash("已取消关注", "info")
    else:
        db.execute(
            "INSERT INTO follow (follower_id, followed_id, create_time) VALUES (?, ?, ?)",
            (session["user_id"], user_id, now())
        )
        db.commit()
        flash("已关注", "success")

    return redirect(url_for("profile", user_id=user_id))


# ===========================================================================
# 路由 - 学术资源匹配模块（智慧芽MCP + 用户自配LLM）
# ===========================================================================

@app.route("/match")
@login_required
def match():
    """学术资源匹配入口页"""
    db = get_db()
    # 预填学习意向
    user = db.execute(
        "SELECT learning_interest FROM user WHERE id = ?",
        (session["user_id"],)
    ).fetchone()
    interest = user["learning_interest"] if user else ""
    # 是否有LLM配置
    llm_cfg = db.execute(
        "SELECT base_url, api_key, model FROM user_llm_config WHERE user_id = ?",
        (session["user_id"],)
    ).fetchone()
    llm_ready = bool(llm_cfg and llm_cfg["api_key"] and llm_cfg["base_url"])
    return render_template(
        "match.html",
        default_interest=interest,
        llm_ready=llm_ready,
        llm_model=(llm_cfg["model"] if llm_ready else ""),
        mcp_ready=mcp_configured(),
    )


@app.route("/match/search", methods=["POST"])
@login_required
def match_search():
    """执行学术资源检索 + 可选的LLM匹配分析"""
    keyword = request.form.get("keyword", "").strip()
    use_interest = request.form.get("use_interest") == "on"
    llm_on = request.form.get("use_llm") == "on"

    if not keyword:
        flash("请输入检索关键词", "danger")
        return redirect(url_for("match"))

    db = get_db()
    # 学习意向（用户勾选则自动采用）
    learning_interest = ""
    if use_interest:
        row = db.execute(
            "SELECT learning_interest FROM user WHERE id = ?",
            (session["user_id"],)
        ).fetchone()
        learning_interest = row["learning_interest"] if row else ""
        if learning_interest and keyword == learning_interest:
            pass  # 关键词即学习意向
        elif learning_interest:
            keyword = f"{keyword} {learning_interest}"

    # 智慧芽 MCP 配置检查
    if not mcp_configured():
        flash("系统尚未配置智慧芽MCP服务，请联系管理员", "warning")
        return redirect(url_for("match"))

    # 调用智慧芽 MCP 检索
    try:
        client = PatsnapMCPClient()
        results = client.search(keyword, limit=10)
    except RuntimeError as exc:
        flash(f"智慧芽检索失败: {exc}", "danger")
        return redirect(url_for("match"))

    # 汇总数量
    patents, literature = results.get("patents", []), results.get("literature", [])
    total = len(patents) + len(literature)
    if total == 0 and not results.get("errors"):
        flash("未检索到相关资源，请尝试更换关键词", "info")
    for err in results.get("errors", []):
        flash(err, "warning")

    # 可选：用户自配 LLM 做匹配度分析
    summary = ""
    llm_error = ""
    if llm_on:
        cfg = db.execute(
            "SELECT base_url, api_key, model FROM user_llm_config WHERE user_id = ?",
            (session["user_id"],)
        ).fetchone()
        if cfg and cfg["api_key"]:
            try:
                summary = analyze_matches(
                    cfg["api_key"], cfg["base_url"], cfg["model"],
                    learning_interest or keyword, results
                )
            except RuntimeError as exc:
                llm_error = str(exc)
        else:
            llm_error = "未配置LLM API，已跳过智能分析"

    # 持久化检索记录
    import json
    search_id = save_search(
        db, session["user_id"], keyword, total, summary
    )
    db.execute(
        "UPDATE academic_search SET results_json = ? WHERE id = ?",
        (json.dumps(results, ensure_ascii=False), search_id)
    )
    db.commit()
    return redirect(url_for("match_result", search_id=search_id, llm_error=llm_error))


@app.route("/match/result/<int:search_id>")
@login_required
def match_result(search_id):
    """学术匹配结果页"""
    import json
    db = get_db()
    record = db.execute(
        "SELECT * FROM academic_search WHERE id = ? AND user_id = ?",
        (search_id, session["user_id"])
    ).fetchone()
    if record is None:
        flash("记录不存在", "danger")
        return redirect(url_for("match"))

    try:
        results = json.loads(record["results_json"] or "{}")
    except json.JSONDecodeError:
        results = {}
    llm_error = request.args.get("llm_error", "")
    return render_template(
        "match_result.html",
        record=record,
        patents=results.get("patents", []),
        literature=results.get("literature", []),
        patents_raw=results.get("patents_raw", ""),
        literature_raw=results.get("literature_raw", ""),
        tools_found=results.get("tools_found", {}),
        errors=results.get("errors", []),
        summary=record["summary"],
        llm_error=llm_error,
    )


@app.route("/match/history")
@login_required
def match_history():
    """学术匹配历史记录"""
    db = get_db()
    records = db.execute(
        "SELECT id, keyword, result_count, create_time FROM academic_search "
        "WHERE user_id = ? ORDER BY create_time DESC",
        (session["user_id"],)
    ).fetchall()
    return render_template("match_history.html", records=records)


@app.route("/settings/llm", methods=["GET", "POST"])
@login_required
def settings_llm():
    """用户自配大模型 API（OpenAI兼容格式）"""
    db = get_db()
    if request.method == "POST":
        action = request.form.get("action", "save")
        if action == "test":
            # 测试连接
            base_url = request.form.get("base_url", "").strip()
            api_key = request.form.get("api_key", "").strip()
            model = request.form.get("model", "").strip()
            try:
                reply = llm_chat(
                    base_url, api_key, model,
                    [{"role": "user", "content": "请回复：连接成功"}],
                )
                flash(f"连接成功！模型回复: {reply[:50]}", "success")
            except RuntimeError as exc:
                flash(f"连接失败: {exc}", "danger")
            return render_template("llm_settings.html", base_url=base_url,
                                   api_key=api_key, model=model,
                                   configured=bool(api_key))
        # 保存配置
        base_url = request.form.get("base_url", "").strip()
        api_key = request.form.get("api_key", "").strip()
        model = request.form.get("model", "").strip()
        if not base_url or not api_key or not model:
            flash("base_url、api_key、model 均不能为空", "danger")
        else:
            exists = db.execute(
                "SELECT id FROM user_llm_config WHERE user_id = ?",
                (session["user_id"],)
            ).fetchone()
            if exists:
                db.execute(
                    "UPDATE user_llm_config SET base_url = ?, api_key = ?, "
                    "model = ?, update_time = ? WHERE user_id = ?",
                    (base_url, api_key, model, now(), session["user_id"])
                )
            else:
                db.execute(
                    "INSERT INTO user_llm_config "
                    "(user_id, base_url, api_key, model, create_time, update_time) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (session["user_id"], base_url, api_key, model, now(), now())
                )
            db.commit()
            flash("LLM API 配置已保存", "success")
        return redirect(url_for("settings_llm"))

    cfg = db.execute(
        "SELECT base_url, api_key, model FROM user_llm_config WHERE user_id = ?",
        (session["user_id"],)
    ).fetchone()
    return render_template(
        "llm_settings.html",
        base_url=(cfg["base_url"] if cfg else ""),
        api_key=(cfg["api_key"] if cfg else ""),
        model=(cfg["model"] if cfg else ""),
        configured=bool(cfg and cfg["api_key"]),
    )


# ===========================================================================
# 路由 - 帖子模块
# ===========================================================================

@app.route("/create", methods=["GET", "POST"])
@login_required
def create_post():
    """发布帖子：标题 + 内容双必填"""
    if request.method == "POST":
        title = request.form.get("title", "").strip()
        content = request.form.get("content", "").strip()

        if not title or not content:
            flash("标题和内容不能为空", "danger")
            return render_template("create_post.html")

        db = get_db()
        db.execute(
            "INSERT INTO post (user_id, title, content, create_time, update_time) "
            "VALUES (?, ?, ?, ?, ?)",
            (session["user_id"], title, content, now(), now())
        )
        db.commit()
        flash("帖子发布成功", "success")
        return redirect(url_for("index"))

    return render_template("create_post.html")


@app.route("/post/<int:post_id>")
def post_detail(post_id):
    """帖子详情：展示完整正文 + 按时间正序排列的所有评论"""
    db = get_db()
    post = db.execute("""
        SELECT p.*, u.username
        FROM post p
        JOIN user u ON p.user_id = u.id
        WHERE p.id = ?
    """, (post_id,)).fetchone()

    if post is None:
        flash("帖子不存在", "danger")
        return redirect(url_for("index"))

    comments = db.execute("""
        SELECT c.*, u.username
        FROM comment c
        JOIN user u ON c.user_id = u.id
        WHERE c.post_id = ?
        ORDER BY c.create_time ASC
    """, (post_id,)).fetchall()

    return render_template("post_detail.html", post=post, comments=comments)


@app.route("/post/<int:post_id>/delete", methods=["POST"])
@login_required
def delete_post(post_id):
    """删除帖子：仅发帖人可删，级联删除所有关联评论"""
    db = get_db()
    post = db.execute(
        "SELECT * FROM post WHERE id = ?", (post_id,)
    ).fetchone()

    if post is None:
        flash("帖子不存在", "danger")
        return redirect(url_for("index"))

    if post["user_id"] != session["user_id"]:
        flash("只能删除自己的帖子", "danger")
        return redirect(url_for("post_detail", post_id=post_id))

    # 级联删除（ON DELETE CASCADE 自动处理 comment）
    db.execute("DELETE FROM post WHERE id = ?", (post_id,))
    db.commit()
    flash("帖子已删除", "success")
    return redirect(url_for("index"))


# ===========================================================================
# 路由 - 评论模块
# ===========================================================================

@app.route("/post/<int:post_id>/comment", methods=["POST"])
@login_required
def add_comment(post_id):
    """新增评论：内容非空校验"""
    content = request.form.get("content", "").strip()

    if not content:
        flash("评论内容不能为空", "danger")
        return redirect(url_for("post_detail", post_id=post_id))

    db = get_db()
    # 验证帖子存在
    post = db.execute(
        "SELECT id, title FROM post WHERE id = ?", (post_id,)
    ).fetchone()
    if post is None:
        flash("帖子不存在", "danger")
        return redirect(url_for("index"))

    # @用户解析：@用户名 -> 站内链接，并给被@用户发系统通知
    content = _parse_mentions(db, content, session["user_id"], post)

    db.execute(
        "INSERT INTO comment (post_id, user_id, content, create_time) "
        "VALUES (?, ?, ?, ?)",
        (post_id, session["user_id"], content, now())
    )
    db.commit()
    flash("评论发表成功", "success")
    return redirect(url_for("post_detail", post_id=post_id))


@app.route("/comment/<int:comment_id>/delete", methods=["POST"])
@login_required
def delete_comment(comment_id):
    """删除评论：仅评论发布者可删"""
    db = get_db()
    comment = db.execute(
        "SELECT * FROM comment WHERE id = ?", (comment_id,)
    ).fetchone()

    if comment is None:
        flash("评论不存在", "danger")
        return redirect(url_for("index"))

    if comment["user_id"] != session["user_id"]:
        flash("只能删除自己的评论", "danger")
        return redirect(url_for("post_detail", post_id=comment["post_id"]))

    post_id = comment["post_id"]
    db.execute("DELETE FROM comment WHERE id = ?", (comment_id,))
    db.commit()
    flash("评论已删除", "success")
    return redirect(url_for("post_detail", post_id=post_id))


# ===========================================================================
# 辅助函数 - @用户解析
# ===========================================================================
def _parse_mentions(db, content: str, sender_id: int, post) -> str:
    """
    解析评论内容中的 @用户名：
      1. 转成站内链接 [@xxx](/profile/用户id)，页面渲染为可点击的用户主页链接
      2. 给被@的用户发送系统通知（排除自己）
    """
    def _replace(m):
        name = m.group(1)
        target = db.execute(
            "SELECT id FROM user WHERE username = ?", (name,)
        ).fetchone()
        if target is None or target["id"] == sender_id:
            return m.group(0)
        sender = db.execute(
            "SELECT username FROM user WHERE id = ?", (sender_id,)
        ).fetchone()
        sender_name = sender["username"] if sender else "某人"
        db.execute(
            "INSERT INTO message "
            "(msg_type, sender_id, receiver_id, content, link, is_read, create_time) "
            "VALUES ('system', ?, ?, ?, ?, 0, ?)",
            (sender_id, target["id"],
             f"{sender_name} 用户在「{post['title']}」中@了你",
             f"/post/{post['id']}", now())
        )
        return f"[@{name}](/profile/{target['id']})"
    return re.sub(r"@([\u4e00-\u9fa5A-Za-z0-9_\-]{2,20})", _replace, content)


# ===========================================================================
# 路由 - 文件上传（发帖/评论中的图片、视频）
# ===========================================================================
@app.route("/upload", methods=["POST"])
@login_required
def upload_file():
    """图片/视频上传：保存到 static/uploads，返回可引用的 URL"""
    f = request.files.get("file")
    if f is None or not f.filename:
        return jsonify({"error": "未选择文件"}), 400
    ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
    if ext in ALLOWED_IMG_EXT:
        max_size = MAX_IMG_SIZE
    elif ext in ALLOWED_VIDEO_EXT:
        max_size = MAX_VIDEO_SIZE
    else:
        return jsonify({"error": "不支持的文件类型：图片(jpg/png/gif/webp)或视频(mp4/webm/ogg/mov/mkv)"}), 400
    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    if size > max_size:
        return jsonify({"error": f"文件过大，上限 {max_size // 1024 // 1024}MB"}), 400
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    fname = f"{uuid.uuid4().hex}.{ext}"
    f.save(os.path.join(UPLOAD_DIR, fname))
    return jsonify({"url": f"/static/uploads/{fname}"})


# ===========================================================================
# 路由 - 信件箱（系统通知中心）
# ===========================================================================
@app.route("/messages")
@login_required
def messages():
    """信件箱（通知中心）：系统通知列表（@提及、好友请求等），打开后自动标记已读"""
    db = get_db()
    systems = db.execute("""
        SELECT m.*, su.username AS sender_name
        FROM message m
        LEFT JOIN user su ON m.sender_id = su.id
        WHERE m.receiver_id = ? AND m.msg_type = 'system'
        ORDER BY m.create_time DESC LIMIT 200
    """, (session["user_id"],)).fetchall()
    db.execute(
        "UPDATE message SET is_read = 1 WHERE receiver_id = ? AND msg_type = 'system'",
        (session["user_id"],)
    )
    db.commit()
    return render_template("messages.html", systems=systems)


# ===========================================================================
# 辅助函数 - 好友关系
# ===========================================================================
def _int_or_zero(s) -> int:
    """表单数字安全转换"""
    try:
        return int(s)
    except (TypeError, ValueError):
        return 0


def _are_friends(db, uid_a: int, uid_b: int) -> bool:
    """是否互为好友"""
    return db.execute(
        "SELECT id FROM friend WHERE user_id = ? AND friend_id = ?",
        (uid_a, uid_b)
    ).fetchone() is not None


def _friend_status(db, me: int, other: int) -> str:
    """好友关系状态：friend / pending_sent / pending_received / none"""
    if _are_friends(db, me, other):
        return "friend"
    row = db.execute(
        "SELECT status FROM friend_request WHERE from_id = ? AND to_id = ?",
        (me, other)
    ).fetchone()
    if row and row["status"] == "pending":
        return "pending_sent"
    row = db.execute(
        "SELECT status FROM friend_request WHERE from_id = ? AND to_id = ?",
        (other, me)
    ).fetchone()
    if row and row["status"] == "pending":
        return "pending_received"
    return "none"


# ===========================================================================
# 路由 - 好友系统
# ===========================================================================
@app.route("/friend/add", methods=["POST"])
@login_required
def add_friend():
    """发送加好友请求，并给对方法系统通知"""
    to_id = _int_or_zero(request.form.get("user_id", ""))
    if to_id == session["user_id"] or to_id == 0:
        flash("无效的用户", "danger")
        return redirect(url_for("index"))
    db = get_db()
    target = db.execute(
        "SELECT id FROM user WHERE id = ?", (to_id,)
    ).fetchone()
    if target is None:
        flash("用户不存在", "danger")
        return redirect(url_for("index"))
    status = _friend_status(db, session["user_id"], to_id)
    if status == "friend":
        flash("你们已经是好友了", "info")
    elif status == "pending_sent":
        flash("已发送过好友请求，等待对方确认", "info")
    elif status == "pending_received":
        flash("对方已向你发送好友请求，请到好友请求页处理", "info")
    else:
        db.execute(
            "INSERT INTO friend_request (from_id, to_id, status, create_time) "
            "VALUES (?, ?, 'pending', ?)",
            (session["user_id"], to_id, now())
        )
        me = db.execute(
            "SELECT username FROM user WHERE id = ?", (session["user_id"],)
        ).fetchone()
        db.execute(
            "INSERT INTO message "
            "(msg_type, sender_id, receiver_id, content, link, is_read, create_time) "
            "VALUES ('system', ?, ?, ?, ?, 0, ?)",
            (session["user_id"], to_id,
             f"{me['username']} 请求添加你为好友",
             "/friend/requests", now())
        )
        db.commit()
        flash("好友请求已发送", "success")
    return redirect(request.referrer or url_for("index"))


@app.route("/friend/requests")
@login_required
def friend_requests():
    """好友请求管理页：我收到的 + 我发出的"""
    db = get_db()
    received = db.execute("""
        SELECT fr.*, u.username, u.avatar FROM friend_request fr
        JOIN user u ON fr.from_id = u.id
        WHERE fr.to_id = ? AND fr.status = 'pending'
        ORDER BY fr.create_time DESC
    """, (session["user_id"],)).fetchall()
    sent = db.execute("""
        SELECT fr.*, u.username, u.avatar FROM friend_request fr
        JOIN user u ON fr.to_id = u.id
        WHERE fr.from_id = ? AND fr.status = 'pending'
        ORDER BY fr.create_time DESC
    """, (session["user_id"],)).fetchall()
    return render_template("friend_requests.html", received=received, sent=sent)


@app.route("/friend/accept", methods=["POST"])
@login_required
def accept_friend():
    """接受好友请求：建立双向好友关系，并通知对方"""
    req_id = _int_or_zero(request.form.get("request_id", ""))
    db = get_db()
    req = db.execute(
        "SELECT * FROM friend_request WHERE id = ?", (req_id,)
    ).fetchone()
    if req is None or req["to_id"] != session["user_id"]:
        flash("请求不存在", "danger")
        return redirect(url_for("friend_requests"))
    db.execute(
        "INSERT OR IGNORE INTO friend (user_id, friend_id, create_time) VALUES (?, ?, ?)",
        (req["to_id"], req["from_id"], now())
    )
    db.execute(
        "INSERT OR IGNORE INTO friend (user_id, friend_id, create_time) VALUES (?, ?, ?)",
        (req["from_id"], req["to_id"], now())
    )
    db.execute("DELETE FROM friend_request WHERE id = ?", (req_id,))
    me = db.execute(
        "SELECT username FROM user WHERE id = ?", (session["user_id"],)
    ).fetchone()
    db.execute(
        "INSERT INTO message "
        "(msg_type, sender_id, receiver_id, content, link, is_read, create_time) "
        "VALUES ('system', ?, ?, ?, ?, 0, ?)",
        (session["user_id"], req["from_id"],
         f"{me['username']} 已接受你的好友请求",
         "/chat", now())
    )
    db.commit()
    flash("已添加好友，快去聊天吧", "success")
    return redirect(url_for("friend_requests"))


@app.route("/friend/reject", methods=["POST"])
@login_required
def reject_friend():
    """拒绝好友请求"""
    req_id = _int_or_zero(request.form.get("request_id", ""))
    db = get_db()
    req = db.execute(
        "SELECT * FROM friend_request WHERE id = ?", (req_id,)
    ).fetchone()
    if req is None or req["to_id"] != session["user_id"]:
        flash("请求不存在", "danger")
        return redirect(url_for("friend_requests"))
    db.execute("DELETE FROM friend_request WHERE id = ?", (req_id,))
    db.commit()
    flash("已拒绝该好友请求", "info")
    return redirect(url_for("friend_requests"))


@app.route("/friend/remove", methods=["POST"])
@login_required
def remove_friend():
    """解除好友关系"""
    fid = _int_or_zero(request.form.get("friend_id", ""))
    db = get_db()
    db.execute(
        "DELETE FROM friend WHERE user_id = ? AND friend_id = ?",
        (session["user_id"], fid)
    )
    db.execute(
        "DELETE FROM friend WHERE user_id = ? AND friend_id = ?",
        (fid, session["user_id"])
    )
    db.commit()
    flash("已解除好友关系", "info")
    return redirect(url_for("chat"))


# ===========================================================================
# 路由 - 一对一聊天
# ===========================================================================
@app.route("/chat")
@login_required
def chat():
    """聊天主页：好友列表 + 最近对话"""
    db = get_db()
    friends = db.execute("""
        SELECT u.id, u.username, u.avatar, u.bio
        FROM friend f
        JOIN user u ON f.friend_id = u.id
        WHERE f.user_id = ?
        ORDER BY u.username
    """, (session["user_id"],)).fetchall()

    # 每个对话方的未读数
    unread_map = {}
    rows = db.execute(
        "SELECT sender_id, COUNT(*) AS c FROM message "
        "WHERE receiver_id = ? AND msg_type = 'private' AND is_read = 0 "
        "GROUP BY sender_id",
        (session["user_id"],)
    ).fetchall()
    for r in rows:
        unread_map[r["sender_id"]] = r["c"]

    # 最近对话：每个对话方取最新一条消息
    recents = db.execute("""
        SELECT m.*, su.username AS sender_name, ru.username AS receiver_name
        FROM message m
        LEFT JOIN user su ON m.sender_id = su.id
        LEFT JOIN user ru ON m.receiver_id = ru.id
        WHERE (m.receiver_id = ? OR m.sender_id = ?) AND m.msg_type = 'private'
        ORDER BY m.create_time DESC, m.id DESC
    """, (session["user_id"], session["user_id"])).fetchall()
    convos = []
    seen = set()
    for m in recents:
        other = m["sender_id"] if m["receiver_id"] == session["user_id"] else m["receiver_id"]
        if other is None or other in seen:
            continue
        seen.add(other)
        convos.append({
            "other_id": other,
            "other_name": (m["sender_name"] if m["receiver_id"] == session["user_id"]
                           else m["receiver_name"]) or "已注销",
            "content": m["content"],
            "time": m["create_time"],
            "mine": m["sender_id"] == session["user_id"],
            "unread": unread_map.get(other, 0),
        })
    return render_template("chat.html", friends=friends, convos=convos)


@app.route("/chat/<int:user_id>")
@login_required
def chat_detail(user_id):
    """一对一聊天界面：往来消息 + 富文本发送框"""
    db = get_db()
    other = db.execute(
        "SELECT id, username, avatar, bio FROM user WHERE id = ?", (user_id,)
    ).fetchone()
    if other is None:
        flash("用户不存在", "danger")
        return redirect(url_for("chat"))
    is_friend = _are_friends(db, session["user_id"], user_id)
    msgs = db.execute("""
        SELECT m.*, u.username AS sender_name
        FROM message m
        LEFT JOIN user u ON m.sender_id = u.id
        WHERE ((m.sender_id = ? AND m.receiver_id = ?)
               OR (m.sender_id = ? AND m.receiver_id = ?))
          AND m.msg_type = 'private'
        ORDER BY m.create_time ASC, m.id ASC
    """, (session["user_id"], user_id, user_id, session["user_id"])).fetchall()
    # 打开聊天即标记与该用户的私信已读
    db.execute(
        "UPDATE message SET is_read = 1 "
        "WHERE receiver_id = ? AND sender_id = ? AND msg_type = 'private'",
        (session["user_id"], user_id)
    )
    db.commit()
    return render_template(
        "chat_detail.html", other=other, msgs=msgs,
        is_friend=is_friend, my_id=session["user_id"]
    )


@app.route("/chat/<int:user_id>/send", methods=["POST"])
@login_required
def chat_send(user_id):
    """发送私信（仅好友之间）"""
    content = request.form.get("content", "").strip()
    if not content:
        flash("消息内容不能为空", "danger")
        return redirect(url_for("chat_detail", user_id=user_id))
    db = get_db()
    other = db.execute(
        "SELECT id FROM user WHERE id = ?", (user_id,)
    ).fetchone()
    if other is None:
        flash("用户不存在", "danger")
        return redirect(url_for("chat"))
    if not _are_friends(db, session["user_id"], user_id):
        flash("仅好友之间可以聊天，请先添加好友", "warning")
        return redirect(url_for("chat_detail", user_id=user_id))
    db.execute(
        "INSERT INTO message "
        "(msg_type, sender_id, receiver_id, content, link, is_read, create_time) "
        "VALUES ('private', ?, ?, ?, '', 0, ?)",
        (session["user_id"], user_id, content, now())
    )
    db.commit()
    return redirect(url_for("chat_detail", user_id=user_id) + "#bottom")


# ===========================================================================
# 入口
# ===========================================================================
if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
