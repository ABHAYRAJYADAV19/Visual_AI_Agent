/**
 * Visual Activity Agent — Content Script
 *
 * Responsibilities:
 * - Listen for consent state changes from background worker
 * - DOM event listeners (click, scroll, navigation) — Phase 3
 * - PII redaction at the source — Phase 3
 * - Message passing to background service worker
 *
 * CRITICAL: This script checks consent state before ANY capture.
 * All capture functions are wrapped in consent gates.
 */

// =============================================================================
// State
// =============================================================================

let captureState = {
  eventsEnabled: false,
  visualEnabled: false,
  isPaused: false,
};

// =============================================================================
// Consent Gate
// =============================================================================

/**
 * Check if event capture is currently allowed based on consent state.
 * @returns {boolean}
 */
function isEventCaptureAllowed() {
  return captureState.eventsEnabled && !captureState.isPaused;
}

// =============================================================================
// Initialize Consent State
// =============================================================================

/**
 * Load consent state from chrome.storage.local on startup.
 */
function initializeConsentState() {
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(
      ["eventsEnabled", "visualEnabled", "isPaused", "onboardingCompleted"],
      (result) => {
        if (!result.onboardingCompleted) {
          console.log("[VAI] Content script: onboarding not completed, no capture.");
          return;
        }

        captureState = {
          eventsEnabled: result.eventsEnabled || false,
          visualEnabled: result.visualEnabled || false,
          isPaused: result.isPaused || false,
        };

        console.log("[VAI] Content script: consent state loaded:", captureState);

        // Start/stop capture based on state
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
          isPaused: message.payload.isPaused,
        };

        if (isEventCaptureAllowed()) {
          startEventCapture();
        } else {
          stopEventCapture();
        }

        sendResponse({ success: true });
        break;

      case "CAPTURE_STATE_CHANGED":
        captureState.isPaused = message.payload.isPaused;

        if (isEventCaptureAllowed()) {
          startEventCapture();
        } else {
          stopEventCapture();
        }

        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false });
    }

    return false;
  });
}

// =============================================================================
// Event Capture (stub — full implementation in Phase 3)
// =============================================================================

let captureActive = false;

/**
 * Start capturing DOM events. Called only when consent is granted.
 * Full implementation with click/scroll/nav listeners in Phase 3.
 */
function startEventCapture() {
  if (captureActive) return;

  // Gate: Only proceed if consent is explicitly granted
  if (!isEventCaptureAllowed()) {
    console.log("[VAI] Content script: capture blocked — no consent.");
    return;
  }

  captureActive = true;
  console.log("[VAI] Content script: event capture STARTED (listeners will be added in Phase 3).");
}

/**
 * Stop capturing DOM events. Called when consent is revoked or capture is paused.
 */
function stopEventCapture() {
  if (!captureActive) return;

  captureActive = false;
  console.log("[VAI] Content script: event capture STOPPED.");
}

// =============================================================================
// Initialize
// =============================================================================

initializeConsentState();

console.log("[VAI] Content script loaded. Capture gated behind consent.");
