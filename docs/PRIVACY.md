# Privacy Model & Data Constraints

Visual Activity Agent is built around a rigorous privacy-first model. This document outlines the technical constraints enforcing this model across the stack.

## 1. Consent Gate

**Constraint:** No data is captured without explicit consent.
**Implementation:**
- The extension installs in an `OFF` state by default.
- `background.js` and `content-script.js` require explicit flags (`eventsEnabled` and `visualEnabled`) stored in `chrome.storage.local`.
- If consent is revoked or paused via the popup, capture stops immediately.

## 2. Point-of-Capture Redaction (Defense in Depth #1)

**Constraint:** Sensitive data never leaves the DOM.
**Implementation:**
- The content script's `redaction.js` module inspects elements *before* accessing their values.
- Input elements matching `type="password"`, `autocomplete` patterns (`cc-number`, `new-password`), or name/id heuristics (e.g. `ssn`, `cvv`) are flagged as `sensitive: true`.
- **CRITICAL:** The `.value` property of sensitive elements is *never read by the JavaScript engine*.

## 3. Regular Expression Scrubbing (Defense in Depth #2)

**Constraint:** Pattern-based PII must be stripped from any text that is captured (e.g. URLs).
**Implementation:**
- Both the client (`redaction.js`) and server (`ingest.py`) execute Regex scrubbing for common PII patterns:
  - SSNs (e.g., `XXX-XX-XXXX`)
  - Credit Cards (13-19 digit blocks)
  - Email Addresses
- Query parameters matching `token`, `password`, `email`, etc., in URLs are replaced with `[REDACTED]`.

## 4. Privacy-Preserving AI Annotation

**Constraint:** The AI model must not extract personal data from screenshots.
**Implementation:**
- The prompt sent to Claude 3.5 Sonnet explicitly forbids reading exact text.
- Claude is constrained to a strict JSON schema containing only `activity_type` (e.g., "browsing"), `category` (e.g., "productivity"), and a high-level `summary` of the UI structure.

## 5. User Control & Data Deletion

**Constraint:** Users own their data and can delete it at any time.
**Implementation:**
- **DELETE /data/me:** Triggers an immediate, permanent cascading delete in PostgreSQL.
- Associated screenshot images are simultaneously deleted from S3/MinIO.
- The extension resets its local counters upon successful deletion.

## 6. Automatic Retention Purge

**Constraint:** Stale data must not be hoarded indefinitely.
**Implementation:**
- The backend runs an asynchronous background loop checking for data older than `RETENTION_DAYS` (configurable, default 30).
- All expired events, AI annotations, and S3 objects are permanently deleted.
