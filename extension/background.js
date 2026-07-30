/**
 * Visual Activity Agent — Background Service Worker
 *
 * Core responsibilities:
 * 1. Onboarding: Open onboarding page on first install
 * 2. Consent gate: ALL capture logic gated behind explicit consent
 * 3. Badge state: Visual indicator (icon badge) of capture status
 * 4. Message handling: Communication with popup, content scripts
 * 5. API communication: Registration, event flush, screenshot upload
 *
 * CRITICAL: Nothing is captured until the user explicitly opts in
 * via the onboarding flow or popup toggles.
 */

// =============================================================================
// Constants
// =============================================================================

const API_BASE_URL = "http://localhost:8000";

const BADGE_STATES = {
  off:     { text: "",    color: "#666666" },
  on:      { text: "ON",  color: "#34d399" },
  paused:  { text: "||",  color: "#fbbf24" },
};

// =============================================================================
// Installation & Onboarding
// =============================================================================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // First install — open onboarding page
    chrome.tabs.create({
      url: chrome.runtime.getURL("onboarding/onboarding.html"),
    });

    // Initialize default state — everything OFF
    chrome.storage.local.set({
      onboardingCompleted: false,
      eventsEnabled: false,
      visualEnabled: false,
      isPaused: false,
      apiKey: null,
      installId: null,
      sessionEventCount: 0,
      sessionScreenshotCount: 0,
      sessionStartTime: null,
      eventBatch: [],
    });

    // Set badge to OFF state
    updateBadge("off");

    console.log("[VAI] Extension installed. Onboarding opened. Capture is OFF.");
  }
});

// =============================================================================
// Badge State Management
// =============================================================================

/**
 * Update the extension icon badge to reflect capture state.
 * This provides a persistent, unmissable indicator of capture status.
 *
 * @param {"off" | "on" | "paused"} state - The capture state
 */
function updateBadge(state) {
  const badge = BADGE_STATES[state] || BADGE_STATES.off;

  chrome.action.setBadgeText({ text: badge.text });
  chrome.action.setBadgeBackgroundColor({ color: badge.color });

  // Also set the badge text color for readability
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: "#ffffff" });
  }
}

/**
 * Determine and apply the correct badge state from stored consent.
 */
async function syncBadgeState() {
  const state = await chrome.storage.local.get([
    "eventsEnabled",
    "visualEnabled",
    "isPaused",
  ]);

  const anyEnabled = state.eventsEnabled || state.visualEnabled;

  if (!anyEnabled) {
    updateBadge("off");
  } else if (state.isPaused) {
    updateBadge("paused");
  } else {
    updateBadge("on");
  }
}

// =============================================================================
// API Communication
// =============================================================================

/**
 * Register this extension installation with the backend API.
 * Stores the returned API key in chrome.storage.local.
 */
async function registerInstall() {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.status}`);
    }

    const data = await response.json();

    await chrome.storage.local.set({
      apiKey: data.api_key,
      installId: data.install_id,
    });

    console.log("[VAI] Registered with backend. Install ID:", data.install_id);
    return data;
  } catch (error) {
    console.error("[VAI] Registration failed:", error);
    return null;
  }
}

/**
 * Get the stored API key, registering first if needed.
 * @returns {Promise<string|null>} The API key, or null if unavailable.
 */
async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (apiKey) return apiKey;

  // Try to register
  const result = await registerInstall();
  return result ? result.api_key : null;
}

// =============================================================================
// Consent Gate
// =============================================================================

/**
 * Check if event capture is currently allowed.
 * Returns true only if events are enabled AND not paused.
 */
async function isEventCaptureAllowed() {
  const state = await chrome.storage.local.get([
    "onboardingCompleted",
    "eventsEnabled",
    "isPaused",
  ]);
  return state.onboardingCompleted && state.eventsEnabled && !state.isPaused;
}

/**
 * Check if visual (screenshot) capture is currently allowed.
 * Returns true only if visual capture is enabled AND not paused.
 */
async function isVisualCaptureAllowed() {
  const state = await chrome.storage.local.get([
    "onboardingCompleted",
    "visualEnabled",
    "isPaused",
  ]);
  return state.onboardingCompleted && state.visualEnabled && !state.isPaused;
}

// =============================================================================
// Message Handling
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "CONSENT_UPDATED":
      handleConsentUpdate(message.payload);
      handleVisualCaptureState();
      sendResponse({ success: true });
      break;

    case "PAUSE_STATE_CHANGED":
      syncBadgeState();
      handleVisualCaptureState();
      // Notify all content scripts about pause state
      broadcastToContentScripts({
        type: "CAPTURE_STATE_CHANGED",
        payload: message.payload,
      });
      sendResponse({ success: true });
      break;

    case "UPDATE_BADGE":
      syncBadgeState();
      sendResponse({ success: true });
      break;

    case "EVENT_BATCH":
      // Content script sending captured events
      handleEventBatch(message.payload);
      sendResponse({ success: true });
      break;

    case "VIEW_DATA":
      // Open data viewer (Phase 5)
      console.log("[VAI] View data requested — will be implemented in Phase 5");
      sendResponse({ success: true });
      break;

    case "DELETE_ALL_DATA":
      // Delete all data (Phase 5)
      handleDeleteAllData().then((result) => {
        sendResponse(result);
      });
      return true; // Async response

    default:
      console.log("[VAI] Unknown message type:", message.type);
      sendResponse({ success: false, error: "Unknown message type" });
  }

  return false;
});

// =============================================================================
// Consent Update Handler
// =============================================================================

async function handleConsentUpdate(payload) {
  console.log("[VAI] Consent updated:", payload);
  await syncBadgeState();

  // If any capture was just enabled and we don't have an API key, register
  if ((payload.eventsEnabled || payload.visualEnabled)) {
    const apiKey = await getApiKey();
    if (!apiKey) {
      console.warn("[VAI] Capture enabled but registration failed.");
    }
  }

  // Notify all content scripts about the new consent state
  broadcastToContentScripts({
    type: "CONSENT_STATE",
    payload: {
      eventsEnabled: payload.eventsEnabled,
      visualEnabled: payload.visualEnabled,
      isPaused: false,
    },
  });
}

// =============================================================================
// Content Script Communication
// =============================================================================

/**
 * Send a message to all active content scripts.
 */
async function broadcastToContentScripts(message) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch {
          // Tab may not have content script loaded
        }
      }
    }
  } catch (error) {
    console.error("[VAI] Broadcast error:", error);
  }
}

// =============================================================================
// Event Batch Handling (stub — full implementation in Phase 3)
// =============================================================================

async function handleEventBatch(events) {
  // Will flush to /ingest/events in Phase 3
  console.log("[VAI] Event batch received:", events.length, "events");

  // Update session counter
  const { sessionEventCount = 0 } = await chrome.storage.local.get("sessionEventCount");
  await chrome.storage.local.set({
    sessionEventCount: sessionEventCount + events.length,
  });
}

// =============================================================================
// Data Deletion (stub — full implementation in Phase 5)
// =============================================================================

async function handleDeleteAllData() {
  // Will call DELETE /data/me in Phase 5
  console.log("[VAI] Delete all data requested — will be implemented in Phase 5");
  return { success: true, message: "Stub — Phase 5" };
}

// =============================================================================
// Visual Capture (Screenshots) - Phase 4
// =============================================================================

const VISUAL_CAPTURE_INTERVAL_MS = 30000; // 30 seconds
let visualCaptureInterval = null;

function startVisualCapture() {
  if (visualCaptureInterval) return;
  console.log("[VAI] Visual capture STARTED.");
  visualCaptureInterval = setInterval(captureScreenshot, VISUAL_CAPTURE_INTERVAL_MS);
}

function stopVisualCapture() {
  if (!visualCaptureInterval) return;
  clearInterval(visualCaptureInterval);
  visualCaptureInterval = null;
  console.log("[VAI] Visual capture STOPPED.");
}

async function captureScreenshot() {
  if (!(await isVisualCaptureAllowed())) {
    stopVisualCapture();
    return;
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) return;
    const activeTab = tabs[0];
    
    // Don't capture privileged Chrome URLs or extension pages
    if (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("chrome-extension://")) {
      return;
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: "jpeg", quality: 60 });
    
    if (dataUrl) {
      await uploadScreenshot(dataUrl, activeTab.url);
      
      // Update session counter
      const { sessionScreenshotCount = 0 } = await chrome.storage.local.get("sessionScreenshotCount");
      await chrome.storage.local.set({
        sessionScreenshotCount: sessionScreenshotCount + 1,
      });
    }
  } catch (error) {
    console.error("[VAI] Screenshot capture failed:", error);
  }
}

async function uploadScreenshot(dataUrl, url) {
  const apiKey = await getApiKey();
  if (!apiKey) return;
  
  // Convert data URL to Blob for upload
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  
  const formData = new FormData();
  formData.append("file", blob, "screenshot.jpg");
  formData.append("url", url);
  formData.append("timestamp", Date.now().toString());

  try {
    const uploadRes = await fetch(`${API_BASE_URL}/ingest/screenshot`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });
    
    if (!uploadRes.ok) {
      console.error("[VAI] Screenshot upload failed:", uploadRes.status);
    }
  } catch (error) {
    console.error("[VAI] Screenshot upload error:", error);
  }
}

// Start/stop intervals based on consent
async function handleVisualCaptureState() {
  if (await isVisualCaptureAllowed()) {
    startVisualCapture();
  } else {
    stopVisualCapture();
  }
}

// Initial state check
handleVisualCaptureState();

// =============================================================================
// Startup
// =============================================================================

// Sync badge state on service worker startup
syncBadgeState();

console.log("[VAI] Background service worker loaded. Capture gated behind consent.");
