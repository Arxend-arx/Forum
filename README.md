# AcademicForumLite

A full-stack academic discussion forum with **front-end/back-end separation**, built for researchers and students to post questions, share knowledge, and discover academic literature.

The front end is a modern **React + Vite** SPA (with bilingual **Chinese/English** support and **light/dark themes**), the back end is a **Flask REST API**, and data is stored in **PostgreSQL**. The whole stack ships as three Docker containers (frontend / backend / database).

## Features

- **User system** — register, login, profile editing, local avatar upload, follow/unfollow, friends & friend requests, online status
- **Posts** — rich Markdown editor with KaTeX math (`$...$` / `$$...$$`), GFM tables, emoji picker, and local image upload
- **Tags & discovery** — `#tag` categorization in posts, keyword search across posts and users, latest / hottest sorting, category filter chips
- **Real-time chat & messaging** — server-sent events (SSE) push for instant DMs and an inbox for system notifications
- **Academic match** — free **OpenAlex** literature search (no API key needed) plus an optional user-configured OpenAI-compatible LLM (DeepSeek, Qwen, Kimi, GLM, OpenAI, ...) for summary and match analysis
- **UI/UX** — bilingual i18n (zh/en), light & dark themes

## Tech Stack

| Layer     | Technology                                          |
|-----------|-----------------------------------------------------|
| Frontend  | React 18, Vite 5, react-router-dom 6, i18next, KaTeX, Nginx (SPA + reverse proxy) |
| Backend   | Flask, psycopg2 (PostgreSQL), SSE                  |
| Database  | PostgreSQL 16 (official Docker image, persisted volume) |
| Infra     | Docker Compose (three containers)                  |

## Project Structure

```
Forum/
├── README.md
├── doc/                    # Design docs, deployment guides, progress log
│   ├── forum_redesign/     # PRD & design documents for the redesign
│   ├── 远程服务更新手册.md  # Remote deployment/update handbook (Chinese)
│   └── ...
└── forum_project/
    ├── app.py              # Flask REST API backend
    ├── academic_match.py   # OpenAlex literature search + LLM analysis
    ├── requirements.txt
    ├── config.json         # Runtime config (literature source = OpenAlex)
    ├── docker-compose.yml  # Three-container orchestration
    ├── docker/             # Dockerfiles & Nginx config
    ├── frontend/           # React + Vite SPA source
    ├── scripts/            # Migration utilities (e.g. SQLite → PostgreSQL)
    ├── deploy/             # Deployment helper scripts
    ├── static/uploads/     # Uploaded images (avatars, post images)
    └── templates/          # Legacy server-rendered pages (unused)
```

## Quick Start (Docker)

Requires Docker with Docker Compose.

```bash
cd forum_project
docker compose up --build
```

Then open **http://localhost:8080**.

The compose file starts three services:

- `frontend` — Nginx serving the built SPA on port **8080**, reverse-proxying `/api` and `/uploads` to the backend
- `backend` — Flask API (internal port 5000), connecting to PostgreSQL
- `db` — PostgreSQL 16 with named volumes for data persistence

> **Note:** The `docker-compose.yml` above is the local development configuration. For production, update the database credentials (see the `db` service environment) and follow the deployment handbook under `doc/`.

## Local Development (without Docker)

### 1. Backend

Make sure a PostgreSQL instance is reachable and configure it through environment variables:

| Variable       | Purpose        |
|----------------|----------------|
| `PGHOST`       | DB host        |
| `PGPORT`       | DB port (default 5432) |
| `PGUSER`       | DB user        |
| `PGPASSWORD`   | DB password    |
| `PGDATABASE`   | DB name        |
| `UPLOAD_DIR`   | Upload directory (optional) |

```bash
cd forum_project
pip install -r requirements.txt
python app.py          # starts the API
```

The API listens on port 5000 by default.

### 2. Frontend

```bash
cd forum_project/frontend
npm install
npm run dev            # Vite dev server, proxies /api to the backend
```

## Academic Match

- Literature search uses the free **OpenAlex** API — no key or enterprise registration required.
- For AI-powered summaries and match analysis, open **LLM Settings** in the app and fill in your own OpenAI-compatible endpoint (`base_url`, `api_key`, `model`).

## Deployment

- Deployment plan: `doc/远程部署计划PRD.md`
- Remote update handbook: `doc/远程服务更新手册.md`

> These documents are written in Chinese.

## Docs

- `doc/forum_redesign/PRD.md` — product requirements
- `doc/forum_redesign/DESIGN.md` — UI/UX design spec
- `doc/工作进度记录.md` — development progress log (Chinese)

## License

Private project — all rights reserved.
