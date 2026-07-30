/**
 * Visual Activity Agent — Content Script
 *
 * Responsibilities:
 * - DOM event listeners (click, scroll, navigation)
 * - PII redaction at the source (passwords, CC fields, SSN patterns)
 * - Message passing to background service worker
 *
 * All capture is gated behind consent flags stored in chrome.storage.local.
 * This script does NOTHING until the user has explicitly opted in.
 *
 * Full implementation in Phase 3.
 */

// Placeholder — no capture until consent is given
console.log("[VAI] Content script loaded. Waiting for consent.");
