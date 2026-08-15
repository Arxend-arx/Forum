"""SQLite -> PostgreSQL 数据迁移脚本（一次性）

用法（在 backend 容器内执行，forum.db 需先复制进容器）：
    docker compose exec backend python /tmp/migrate.py /tmp/forum.db

说明：
    - 从 SQLite 读取存量数据，插入 PostgreSQL（保持原 id）
    - 逐表修正自增序列（setval），保证后续插入 id 不冲突
    - 幂等：重复执行时 ON CONFLICT DO NOTHING 跳过已存在行
"""

import os
import sqlite3
import sys

import psycopg2


TABLES = [
    "user", "post", "comment", "follow",
    "user_llm_config", "academic_search",
    "message", "friend", "friend_request",
]


def connect_pg():
    return psycopg2.connect(
        host=os.environ["PGHOST"],
        port=os.environ.get("PGPORT", "5432"),
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
        dbname=os.environ["PGDATABASE"],
    )


def main(src_db: str):
    sl = sqlite3.connect(src_db)
    sl.row_factory = sqlite3.Row
    pg = connect_pg()
    cur = pg.cursor()

    total = 0
    for table in TABLES:
        rows = sl.execute(f'SELECT * FROM "{table}"').fetchall()
        if not rows:
            print(f"[{table}] 0 rows, skip")
            continue
        cols = list(rows[0].keys())
        colsql = ", ".join(f'"{c}"' for c in cols)
        ph = ", ".join(["%s"] * len(cols))
        for r in rows:
            cur.execute(
                f'INSERT INTO "{table}" ({colsql}) VALUES ({ph}) ON CONFLICT DO NOTHING',
                tuple(r[c] for c in cols),
            )
        # 修正自增序列
        cur.execute(
            f"SELECT setval(pg_get_serial_sequence('\"{table}\"', 'id'), "
            f"(SELECT COALESCE(MAX(id), 1) FROM \"{table}\"))"
        )
        print(f"[{table}] {len(rows)} rows migrated")
        total += len(rows)

    pg.commit()
    cur.close()
    pg.close()
    sl.close()
    print(f"migration done, total {total} rows")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/forum.db")
