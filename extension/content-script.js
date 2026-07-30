/**
 * Visual Activity Agent — Content Script
 *
 * Responsibilities:
 * 1. Listen for consent state changes from background worker
 * 2. DOM event listeners: click, scroll, navigation, focus/blur
 * 3. PII redaction at the source via the redaction module
 * 4. Message passing captured events to background service worker
 *
 * CRITICAL: This script checks consent state before ANY capture.
 * All capture functions are wrapped in consent gates.
 *
 * Note: ES module imports don't work in MV3 content scripts,
 * so we inline the redaction logic here (same source as lib/redaction.js).
 */

// =============================================================================
// Inlined Redaction Logic (from lib/redaction.js)
// Content scripts can't use ES modules, so we inline the functions.
// The lib/redaction.js module is the canonical source for unit testing.
// =============================================================================

const SENSITIVE_AUTOCOMPLETE = [
  "cc-name", "cc-given-name", "cc-additional-name", "cc-family-name",
  "cc-number", "cc-exp", "cc-exp-month", "cc-exp-year", "cc-csc", "cc-type",
  "new-password", "current-password",
];

const SENSITIVE_INPUT_TYPES = ["password"];

const SENSITIVE_NAME_PATTERNS = [
  /pass(word)?/i, /\bpin\b/i, /ssn/i, /social.?sec/i,
  /credit.?card/i, /card.?num/i, /\bcvv\b/i, /\bcvc\b/i, /\bcsc\b/i,
  /secret/i, /token/i,
];

const PII_PATTERNS = [
  { pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replacement: "[SSN REDACTED]" },
  { pattern: /\b(?:\d[-\s]?){13,19}\b/g, replacement: "[CARD REDACTED]" },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[EMAIL REDACTED]" },
];

function isSensitiveField(element) {
  if (!element || !element.tagName) return false;
  const tagName = element.tagName.toLowerCase();
  if (tagName === "input") {
    const inputType = (element.getAttribute("type") || "text").toLowerCase();
    if (SENSITIVE_INPUT_TYPES.includes(inputType)) return true;
  }
  const autocomplete = (element.getAttribute("autocomplete") || "").toLowerCase();
  if (SENSITIVE_AUTOCOMPLETE.some((val) => autocomplete.includes(val))) return true;
  const name = (element.getAttribute("name") || "").toLowerCase();
  const id = (element.getAttribute("id") || "").toLowerCase();
  const ariaLabel = (element.getAttribute("aria-label") || "").toLowerCase();
  const textToCheck = `${name} ${id} ${ariaLabel}`;
  if (SENSITIVE_NAME_PATTERNS.some((p) => p.test(textToCheck))) return true;
  return false;
}

function redactPII(text) {
  if (!text || typeof text !== "string") return text;
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

function getSafeElementInfo(element) {
  if (!element || !element.tagName) return { tag: "unknown" };
  const info = {
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute("role") || null,
    ariaLabel: element.getAttribute("aria-label") || null,
    type: element.getAttribute("type") || null,
    id: element.id || null,
    className: element.className ? String(element.className).substring(0, 100) : null,
  };
  if (isSensitiveField(element)) {
    info.sensitive = true;
    info.value = "[REDACTED]";
    return info;
  }
  if (info.tag === "a") {
    info.href = redactPII(element.getAttribute("href") || "");
  }
  return info;
}

function redactURL(url) {
  if (!url || typeof url !== "string") return url;
  try {
    const parsed = new URL(url);
    const sensitiveParams = ["email", "password", "pass", "token", "secret", "ssn", "cc", "card", "cvv", "key", "auth"];
    for (const [key] of parsed.searchParams) {
      if (sensitiveParams.some((p) => key.toLowerCase().includes(p))) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    return parsed.toString();
  } catch {
    return redactPII(url);
  }
}

// =============================================================================
// State
// =============================================================================

let captureState = {
  eventsEnabled: false,
  visualEnabled: false,
  isPaused: false,
};

let captureActive = false;
let eventBuffer = [];

// Scroll tracking
let lastScrollDepth = 0;
let scrollDebounceTimer = null;
const SCROLL_DEBOUNCE_MS = 500;

// =============================================================================
// Consent Gate
// =============================================================================

function isEventCaptureAllowed() {
  return captureState.eventsEnabled && !captureState.isPaused;
}

// =============================================================================
// Initialize Consent State
// =============================================================================

function initializeConsentState() {
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(
      ["eventsEnabled", "visualEnabled", "isPaused", "onboardingCompleted"],
      (result) => {
        if (!result.onboardingCompleted) return;

        captureState = {
          eventsEnabled: result.eventsEnabled || false,
          visualEnabled: result.visualEnabled || false,
          isPaused: result.isPaused || false,
        };

        if (isEventCaptureAllowed()) {
          startEventCapture();
        }
      }
    );
  }
}

// =============================================================================
// Message Handling
// =============================================================================

if (typeof chrome !== "undefined" && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case "CONSENT_STATE":
        captureState = {
          eventsEnabled: message.payload.eventsEnabled,
          visualEnabled: message.payload.visualEnabled,
          isPaused: message.payload.isPaused || false,
        };
        if (isEventCaptureAllowed()) startEventCapture();
        else stopEventCapture();
        sendResponse({ success: true });
        break;

      case "CAPTURE_STATE_CHANGED":
        captureState.isPaused = message.payload.isPaused;
        if (isEventCaptureAllowed()) startEventCapture();
        else stopEventCapture();
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false });
    }
    return false;
  });
}

// =============================================================================
// Event Listeners
// =============================================================================

/**
 * Handle click events — captures element metadata + coordinates, never text.
 */
function handleClick(event) {
  if (!isEventCaptureAllowed()) return;

  const element = event.target;

  // NEVER read value from sensitive fields
  if (isSensitiveField(element)) {
    sendEvent({
      type: "click",
      url: redactURL(window.location.href),
      element: { tag: element.tagName.toLowerCase(), sensitive: true, value: "[REDACTED]" },
      coordinates: { x: event.clientX, y: event.clientY },
      timestamp: Date.now(),
    });
    return;
  }

  sendEvent({
    type: "click",
    url: redactURL(window.location.href),
    element: getSafeElementInfo(element),
    coordinates: { x: event.clientX, y: event.clientY },
    timestamp: Date.now(),
  });
}

/**
 * Handle scroll events — captures scroll depth (debounced).
 */
function handleScroll() {
  if (!isEventCaptureAllowed()) return;

  if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);

  scrollDebounceTimer = setTimeout(() => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    );
    const viewportHeight = window.innerHeight;
    const scrollDepth = Math.round(
      ((scrollTop + viewportHeight) / docHeight) * 100
    );

    // Only send if scroll depth changed significantly
    if (Math.abs(scrollDepth - lastScrollDepth) >= 5) {
      lastScrollDepth = scrollDepth;

      sendEvent({
        type: "scroll",
        url: redactURL(window.location.href),
        scrollDepth,
        scrollTop: Math.round(scrollTop),
        timestamp: Date.now(),
      });
    }
  }, SCROLL_DEBOUNCE_MS);
}

/**
 * Handle navigation events via History API.
 */
function handleNavigation(method) {
  if (!isEventCaptureAllowed()) return;

  sendEvent({
    type: "navigation",
    url: redactURL(window.location.href),
    method, // pushState, replaceState, popstate
    timestamp: Date.now(),
  });
}

/**
 * Handle visibility change (tab focus/blur).
 */
function handleVisibilityChange() {
  if (!isEventCaptureAllowed()) return;

  sendEvent({
    type: document.hidden ? "tab_blur" : "tab_focus",
    url: redactURL(window.location.href),
    timestamp: Date.now(),
  });
}

// =============================================================================
// History API Hooks
// =============================================================================

const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function (...args) {
  originalPushState.apply(this, args);
  handleNavigation("pushState");
};

history.replaceState = function (...args) {
  originalReplaceState.apply(this, args);
  handleNavigation("replaceState");
};

// =============================================================================
// Event Capture Start/Stop
// =============================================================================

function startEventCapture() {
  if (captureActive) return;
  if (!isEventCaptureAllowed()) return;

  captureActive = true;

  document.addEventListener("click", handleClick, { capture: true, passive: true });
  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("popstate", () => handleNavigation("popstate"));
  document.addEventListener("visibilitychange", handleVisibilityChange);

  // Send initial navigation event
  sendEvent({
    type: "navigation",
    url: redactURL(window.location.href),
    method: "pageload",
    timestamp: Date.now(),
  });

  console.log("[VAI] Content script: event capture STARTED.");
}

function stopEventCapture() {
  if (!captureActive) return;

  captureActive = false;

  document.removeEventListener("click", handleClick, { capture: true });
  window.removeEventListener("scroll", handleScroll);
  document.removeEventListener("visibilitychange", handleVisibilityChange);

  // Flush any buffered events
  flushEventBuffer();

  console.log("[VAI] Content script: event capture STOPPED.");
}

// =============================================================================
// Event Sending (to background worker via batching)
// =============================================================================

const EVENT_BUFFER_SIZE = 10;
const EVENT_BUFFER_FLUSH_MS = 5000;
let bufferFlushTimer = null;

function sendEvent(event) {
  eventBuffer.push(event);

  if (eventBuffer.length >= EVENT_BUFFER_SIZE) {
    flushEventBuffer();
  } else if (!bufferFlushTimer) {
    bufferFlushTimer = setTimeout(flushEventBuffer, EVENT_BUFFER_FLUSH_MS);
  }
}

function flushEventBuffer() {
  if (eventBuffer.length === 0) return;

  if (bufferFlushTimer) {
    clearTimeout(bufferFlushTimer);
    bufferFlushTimer = null;
  }

  const events = [...eventBuffer];
  eventBuffer = [];

  if (typeof chrome !== "undefined" && chrome.runtime) {
    try {
      chrome.runtime.sendMessage({
        type: "EVENT_BATCH",
        payload: events,
      });
    } catch (error) {
      console.error("[VAI] Failed to send event batch:", error);
    }
  }
}

// =============================================================================
// Initialize
// =============================================================================

initializeConsentState();
console.log("[VAI] Content script loaded. Capture gated behind consent.");
