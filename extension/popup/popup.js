/**
 * Visual Activity Agent — Popup Script
 *
 * Controls:
 * - Consent toggles (synced with chrome.storage.local)
 * - Pause/Resume capture
 * - View My Data button
 * - Delete All My Data button (with confirmation modal)
 * - Live capture status indicator
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM References ---
  const notOnboarded = document.getElementById("not-onboarded");
  const mainControls = document.getElementById("main-controls");
  const btnOpenOnboarding = document.getElementById("btn-open-onboarding");

  const statusIndicator = document.getElementById("status-indicator");
  const statusLabel = document.getElementById("status-label");

  const btnPauseResume = document.getElementById("btn-pause-resume");
  const pauseIcon = document.getElementById("pause-icon");
  const pauseLabel = document.getElementById("pause-label");

  const consentEvents = document.getElementById("popup-consent-events");
  const consentVisual = document.getElementById("popup-consent-visual");

  const statEvents = document.getElementById("stat-events");
  const statScreenshots = document.getElementById("stat-screenshots");
  const statSession = document.getElementById("stat-session");

  const btnViewData = document.getElementById("btn-view-data");
  const btnDeleteData = document.getElementById("btn-delete-data");
  const deleteModal = document.getElementById("delete-modal");
  const btnCancelDelete = document.getElementById("btn-cancel-delete");
  const btnConfirmDelete = document.getElementById("btn-confirm-delete");

  const btnOptions = document.getElementById("btn-options");
  const btnPrivacy = document.getElementById("btn-privacy");

  // --- State ---
  let isPaused = false;
  let isEventsEnabled = false;
  let isVisualEnabled = false;

  // --- Load State from Storage ---
  function loadState() {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(
        [
          "onboardingCompleted",
          "eventsEnabled",
          "visualEnabled",
          "isPaused",
          "sessionEventCount",
          "sessionScreenshotCount",
          "sessionStartTime",
        ],
        (result) => {
          if (!result.onboardingCompleted) {
            notOnboarded.style.display = "block";
            mainControls.style.display = "none";
            return;
          }

          notOnboarded.style.display = "none";
          mainControls.style.display = "block";

          // Consent toggles
          isEventsEnabled = result.eventsEnabled || false;
          isVisualEnabled = result.visualEnabled || false;
          consentEvents.checked = isEventsEnabled;
          consentVisual.checked = isVisualEnabled;

          // Pause state
          isPaused = result.isPaused || false;
          updatePauseUI();

          // Stats
          statEvents.textContent = result.sessionEventCount || 0;
          statScreenshots.textContent = result.sessionScreenshotCount || 0;

          if (result.sessionStartTime) {
            const elapsed = Math.floor(
              (Date.now() - result.sessionStartTime) / 60000
            );
            statSession.textContent = elapsed < 60
              ? `${elapsed}m`
              : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`;
          }

          updateCaptureStatus();
        }
      );
    } else {
      // Dev fallback
      notOnboarded.style.display = "none";
      mainControls.style.display = "block";
    }
  }

  // --- Capture Status Indicator ---
  function updateCaptureStatus() {
    const anyEnabled = isEventsEnabled || isVisualEnabled;

    statusIndicator.className = "status-indicator";
    statusLabel.className = "status-label";

    if (!anyEnabled) {
      statusIndicator.classList.add("off");
      statusLabel.textContent = "OFF";
    } else if (isPaused) {
      statusIndicator.classList.add("paused");
      statusLabel.classList.add("paused");
      statusLabel.textContent = "PAUSED";
    } else {
      statusIndicator.classList.add("on");
      statusLabel.classList.add("on");
      statusLabel.textContent = "CAPTURING";
    }

    // Update extension badge via background worker
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: "UPDATE_BADGE",
        payload: {
          anyEnabled,
          isPaused,
        },
      });
    }
  }

  // --- Pause/Resume ---
  function updatePauseUI() {
    if (isPaused) {
      pauseIcon.textContent = "▶️";
      pauseLabel.textContent = "Resume Capture";
      btnPauseResume.style.borderColor = "rgba(52, 211, 153, 0.3)";
    } else {
      pauseIcon.textContent = "⏸️";
      pauseLabel.textContent = "Pause Capture";
      btnPauseResume.style.borderColor = "";
    }
  }

  btnPauseResume.addEventListener("click", () => {
    isPaused = !isPaused;
    updatePauseUI();
    updateCaptureStatus();

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ isPaused });
      chrome.runtime.sendMessage({
        type: "PAUSE_STATE_CHANGED",
        payload: { isPaused },
      });
    }
  });

  // --- Consent Toggle Changes ---
  consentEvents.addEventListener("change", () => {
    isEventsEnabled = consentEvents.checked;
    updateCaptureStatus();

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ eventsEnabled: isEventsEnabled });
      chrome.runtime.sendMessage({
        type: "CONSENT_UPDATED",
        payload: {
          eventsEnabled: isEventsEnabled,
          visualEnabled: isVisualEnabled,
        },
      });
    }
  });

  consentVisual.addEventListener("change", () => {
    isVisualEnabled = consentVisual.checked;
    updateCaptureStatus();

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ visualEnabled: isVisualEnabled });
      chrome.runtime.sendMessage({
        type: "CONSENT_UPDATED",
        payload: {
          eventsEnabled: isEventsEnabled,
          visualEnabled: isVisualEnabled,
        },
      });
    }
  });

  // --- View Data ---
  btnViewData.addEventListener("click", () => {
    // Will be wired to GET /data/me in Phase 5
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "VIEW_DATA" });
    }
    console.log("[VAI] View data requested");
  });

  // --- Delete Data ---
  btnDeleteData.addEventListener("click", () => {
    deleteModal.style.display = "flex";
  });

  btnCancelDelete.addEventListener("click", () => {
    deleteModal.style.display = "none";
  });

  btnConfirmDelete.addEventListener("click", async () => {
    btnConfirmDelete.textContent = "Deleting...";
    btnConfirmDelete.disabled = true;

    // Will be wired to DELETE /data/me in Phase 5
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "DELETE_ALL_DATA" }, (response) => {
        if (response && response.success) {
          btnConfirmDelete.textContent = "✓ Deleted";
          statEvents.textContent = "0";
          statScreenshots.textContent = "0";
          setTimeout(() => {
            deleteModal.style.display = "none";
            btnConfirmDelete.textContent = "Delete Everything";
            btnConfirmDelete.disabled = false;
          }, 1500);
        } else {
          btnConfirmDelete.textContent = "Error — try again";
          btnConfirmDelete.disabled = false;
        }
      });
    } else {
      // Dev fallback
      console.log("[VAI] Delete all data requested (dev mode)");
      setTimeout(() => {
        btnConfirmDelete.textContent = "✓ Deleted";
        statEvents.textContent = "0";
        statScreenshots.textContent = "0";
        setTimeout(() => {
          deleteModal.style.display = "none";
          btnConfirmDelete.textContent = "Delete Everything";
          btnConfirmDelete.disabled = false;
        }, 1500);
      }, 500);
    }
  });

  // --- Footer Links ---
  btnOptions.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.openOptionsPage();
    }
  });

  btnPrivacy.addEventListener("click", (e) => {
    e.preventDefault();
    // Open privacy doc (will be a hosted page or local file)
    console.log("[VAI] Privacy link clicked");
  });

  // --- Open Onboarding ---
  btnOpenOnboarding.addEventListener("click", () => {
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
    }
  });

  // --- Initialize ---
  loadState();
});
