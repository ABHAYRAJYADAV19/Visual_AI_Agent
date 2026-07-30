# Visual Activity AI Agent

[![CI](https://github.com/YOUR_USERNAME/visual-activity-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/visual-activity-agent/actions/workflows/ci.yml)

A **privacy-first** browser activity monitoring system that uses multimodal AI to
generate structured summaries of your browsing sessions. Built as a Chrome Extension
(Manifest V3) with a FastAPI backend and Claude AI for visual annotation.

> **This is an opt-in personal productivity tool** — think RescueTime or Hubstaff.
> Consent, transparency, and data control are first-class features, not afterthoughts.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                Chrome Extension (MV3)                │
│                                                      │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │  Onboarding  │  │   Popup    │  │   Options    │ │
│  │  (consent)   │  │ (controls) │  │  (settings)  │ │
│  └──────┬───────┘  └─────┬──────┘  └──────┬───────┘ │
│         │                │                 │         │
│  ┌──────▼────────────────▼─────────────────▼───────┐ │
│  │          Background Service Worker              │ │
│  │  • Consent gate  • Badge state  • Batch flush   │ │
│  │  • Screenshot capture  • API communication      │ │
│  └──────────────────────┬──────────────────────────┘ │
│                         │                            │
│  ┌──────────────────────▼──────────────────────────┐ │
│  │              Content Script                     │ │
│  │  • DOM event listeners  • PII redaction         │ │
│  │  • Click/scroll/nav capture                     │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────┘
                           │ HTTPS (Bearer token)
┌──────────────────────────▼───────────────────────────┐
│                  Backend API (FastAPI)                │
│                                                      │
│  ┌─────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  /auth  │  │   /ingest    │  │    /data/me    │  │
│  │register │  │ events, imgs │  │  view, delete  │  │
│  └────┬────┘  └──────┬───────┘  └───────┬────────┘  │
│       │              │                   │           │
│  ┌────▼──────────────▼───────────────────▼────────┐  │
│  │              PostgreSQL                        │  │
│  │  installs │ events │ screenshots │ annotations │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────┐    ┌──────────────────────────┐  │
│  │  MinIO / S3    │    │  Annotation Worker       │  │
│  │  (screenshots) │◄───│  Claude multimodal API   │  │
│  └────────────────┘    └──────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Retention Purge Job (scheduled)               │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## Privacy & Consent Design

Privacy is the **core feature** of this project, not a bolt-on. Every design
decision prioritizes user control:

| Principle | Implementation |
|---|---|
| **Off by default** | Extension installs with all capture disabled. An onboarding screen explains data collection in plain language before any toggle is available. |
| **Granular consent** | Two independent toggles: "Activity Events" (clicks/scroll/nav) and "Visual Capture" (screenshots). Visual capture defaults OFF even when events are ON. |
| **Visible indicator** | Extension badge shows colored state: 🟢 capturing, 🟡 paused, ⚪ off. You always know when capture is running. |
| **Source-level redaction** | Content script **never reads** values from password fields, credit card inputs (`autocomplete=cc-*`), or fields matching PII patterns (SSN, card numbers). Redaction happens in the browser before data leaves. |
| **No text transcription** | AI annotation describes *activity type and category*, never transcribes visible text — avoiding incidental PII capture. |
| **Full data control** | View all stored data anytime. One-click hard delete (not soft delete) of all your data across all tables and object storage. |
| **Retention TTL** | Configurable server-side retention period with automated purge job. |
| **Per-install isolation** | Every install gets its own API key (hashed at rest). No shared keys, no cross-user access. |

For the full privacy design document, see [`docs/PRIVACY.md`](docs/PRIVACY.md).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Vanilla JavaScript, Chrome Manifest V3 |
| Backend | Python 3.12, FastAPI, SQLAlchemy (async), Alembic |
| Database | PostgreSQL 15 |
| Object Storage | MinIO (S3-compatible), swappable to AWS S3 via env |
| AI | Anthropic Claude API (multimodal vision) |
| Auth | Per-install API key, Bearer token scheme |
| Tests | pytest (backend), Vitest (extension) |
| CI | GitHub Actions |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Postgres + MinIO)
- [Python 3.12+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/) (for extension tests)
- [Google Chrome](https://www.google.com/chrome/) (for loading the extension)

### 1. Clone & start infrastructure

```bash
git clone https://github.com/YOUR_USERNAME/visual-activity-agent.git
cd visual-activity-agent

# Start Postgres and MinIO
docker-compose up -d

# Verify services are healthy
docker-compose ps
```

### 2. Set up the backend

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template and configure
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY (optional for phases 0-3)

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload --port 8000
```

The API is now running at `http://localhost:8000`. Check `http://localhost:8000/health`.

### 3. Load the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo
5. The onboarding page will open automatically — read and configure consent

### 4. Run tests

```bash
# Backend tests
cd backend
pytest -v

# Extension tests
cd extension
npm install
npx vitest run
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://vai_user:vai_local_password@localhost:5432/vai_db` | Postgres connection string |
| `S3_ENDPOINT_URL` | `http://localhost:9000` | MinIO / S3 endpoint |
| `S3_ACCESS_KEY` | `minioadmin` | S3 access key |
| `S3_SECRET_KEY` | `minioadmin` | S3 secret key |
| `S3_BUCKET_NAME` | `vai-screenshots` | Bucket for screenshot storage |
| `ANTHROPIC_API_KEY` | *(required for AI annotation)* | Claude API key |
| `RETENTION_DAYS` | `30` | Days to retain data before purge |
| `API_RATE_LIMIT` | `100` | Max events per minute per install |

---

## Project Structure

```
visual-activity-agent/
├── README.md
├── LICENSE
├── docker-compose.yml
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   └── PRIVACY.md
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content-script.js
│   ├── icons/
│   ├── lib/
│   │   ├── redaction.js
│   │   └── batcher.js
│   ├── onboarding/
│   │   ├── onboarding.html
│   │   ├── onboarding.css
│   │   └── onboarding.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── options/
│   │   ├── options.html
│   │   ├── options.css
│   │   └── options.js
│   └── tests/
│       ├── redaction.test.js
│       └── batcher.test.js
└── backend/
    ├── requirements.txt
    ├── alembic.ini
    ├── .env.example
    ├── app/
    │   ├── __init__.py
    │   ├── main.py
    │   ├── config.py
    │   ├── database.py
    │   ├── models/
    │   │   ├── __init__.py
    │   │   ├── install.py
    │   │   ├── event.py
    │   │   └── screenshot.py
    │   ├── schemas/
    │   │   ├── __init__.py
    │   │   ├── auth.py
    │   │   ├── events.py
    │   │   ├── screenshots.py
    │   │   └── data.py
    │   ├── routers/
    │   │   ├── __init__.py
    │   │   ├── auth.py
    │   │   ├── ingest.py
    │   │   └── data.py
    │   ├── services/
    │   │   ├── __init__.py
    │   │   ├── storage.py
    │   │   └── retention.py
    │   └── workers/
    │       ├── __init__.py
    │       └── annotator.py
    └── tests/
        ├── __init__.py
        ├── conftest.py
        ├── test_auth.py
        ├── test_ingest.py
        ├── test_data.py
        └── test_redaction.py
```

---

## License

[MIT](LICENSE)
