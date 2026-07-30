# Visual Activity Agent

A privacy-first, production-ready browser activity monitoring system built for transparency and user control.

## Overview

Visual Activity Agent consists of two parts:
1. **Chrome Extension (Manifest V3)**: Captures DOM events and screenshots, strictly gated behind explicit user consent. Includes client-side PII redaction.
2. **Backend Service**: A FastAPI backend with PostgreSQL, MinIO (S3), and Claude 3.5 Sonnet integrations. It ingests data securely, annotates visual structure without reading text, and enforces retention limits.

## Core Privacy Features
- **Capture is OFF by default**: Nothing is captured until explicit onboarding is completed.
- **Client-Side Redaction**: Passwords and credit card inputs are never read. PII patterns (SSN, emails) are scrubbed at the source.
- **Server-Side Redaction**: Defense-in-depth scrubbing before storage.
- **Structural AI Annotation**: Claude is prompted to analyze page *structure* (e.g. "shopping cart"), explicitly instructed not to read personal data.
- **Data Control**: Users can pause capture, view their data summaries, and permanently delete all their data with one click.
- **Automatic Retention Purge**: Data older than 30 days is automatically purged.

## Setup & Running

### Requirements
- Node.js 18+ (for extension tests)
- Python 3.12+ 
- Docker & Docker Compose (for Postgres and MinIO)

### 1. Start Infrastructure
```bash
docker-compose up -d
```
This starts PostgreSQL (port 5432) and MinIO (ports 9000/9001).

### 2. Backend Setup
```bash
cd backend
python -m venv venv
# Activate venv: `source venv/bin/activate` or `.\venv\Scripts\activate`
pip install -r requirements.txt

# Configure environment (add ANTHROPIC_API_KEY for AI annotation)
cp .env.example .env

# Run database migrations
alembic upgrade head

# Start API server
uvicorn app.main:app --reload
```

### 3. Extension Setup
1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `extension` directory in this project.
4. The onboarding flow will launch automatically.

## Tests
Extension unit tests (vitest):
```bash
cd extension
npm install
npx vitest run
```

## Architecture
- **Backend**: FastAPI, SQLAlchemy (Async), Alembic, Pydantic, Boto3, Anthropic SDK.
- **Extension**: Manifest V3, Vanilla JS (Service Workers, Content Scripts), Chrome Storage API, `chrome.tabs.captureVisibleTab`.
- **Database**: PostgreSQL 15.
- **Object Storage**: MinIO.
