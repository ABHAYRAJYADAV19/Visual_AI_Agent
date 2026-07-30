/**
 * Visual Activity Agent — Onboarding Script
 *
 * Three-step consent onboarding flow:
 * 1. Understand: Plain-language data collection explanation
 * 2. Choose: Two independent consent toggles (events + visual)
 * 3. Confirm: Summary + save to chrome.storage.local
 *
 * Consent state is stored in chrome.storage.local and gates ALL capture logic
 * in the content script and background worker.
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM References ---
  const steps = document.querySelectorAll(".step");
  const stepContents = document.querySelectorAll(".step-content");

  const btnNext1 = document.getElementById("btn-next-1");
  const btnBack2 = document.getElementById("btn-back-2");
  const btnNext2 = document.getElementById("btn-next-2");
  const btnBack3 = document.getElementById("btn-back-3");
  const btnFinish = document.getElementById("btn-finish");

  const consentEvents = document.getElementById("consent-events");
  const consentVisual = document.getElementById("consent-visual");

  const toggleEvents = document.getElementById("toggle-events");
  const toggleVisual = document.getElementById("toggle-visual");

  const summaryEvents = document.getElementById("summary-events");
  const summaryVisual = document.getElementById("summary-visual");

  let currentStep = 1;

  // --- Step Navigation ---
  function goToStep(step) {
    // Update step indicators
    steps.forEach((s, i) => {
      const stepNum = i + 1;
      s.classList.remove("active", "completed");
      if (stepNum === step) {
        s.classList.add("active");
      } else if (stepNum < step) {
        s.classList.add("completed");
      }
    });

    // Update step content visibility
    stepContents.forEach((content) => {
      content.classList.remove("active");
    });
    const target = document.getElementById(`step-${step}`);
    if (target) {
      target.classList.add("active");
    }

    currentStep = step;

    // Update summary on step 3
    if (step === 3) {
      updateSummary();
    }
  }

  // --- Toggle State Management ---
  function updateToggleUI(checkbox, toggleContainer) {
    const statusDot = toggleContainer.querySelector(".status-dot");
    const statusText = toggleContainer.querySelector(".status-text");

    if (checkbox.checked) {
      toggleContainer.classList.add("enabled");
      statusDot.classList.remove("off");
      statusDot.classList.add("on");
      statusText.textContent = "Capture ON";
      statusText.style.color = "var(--safe-green)";
    } else {
      toggleContainer.classList.remove("enabled");
      statusDot.classList.remove("on");
      statusDot.classList.add("off");
      statusText.textContent = "Capture OFF";
      statusText.style.color = "";
    }
  }

  function updateSummary() {
    const eventsValue = summaryEvents.querySelector(".summary-value");
    const visualValue = summaryVisual.querySelector(".summary-value");

    if (consentEvents.checked) {
      eventsValue.textContent = "ON";
      eventsValue.className = "summary-value on";
    } else {
      eventsValue.textContent = "OFF";
      eventsValue.className = "summary-value off";
    }

    if (consentVisual.checked) {
      visualValue.textContent = "ON";
      visualValue.className = "summary-value on";
    } else {
      visualValue.textContent = "OFF";
      visualValue.className = "summary-value off";
    }
  }

  // --- Event Listeners ---
  btnNext1.addEventListener("click", () => goToStep(2));
  btnBack2.addEventListener("click", () => goToStep(1));
  btnNext2.addEventListener("click", () => goToStep(3));
  btnBack3.addEventListener("click", () => goToStep(2));

  consentEvents.addEventListener("change", () => {
    updateToggleUI(consentEvents, toggleEvents);
  });

  consentVisual.addEventListener("change", () => {
    updateToggleUI(consentVisual, toggleVisual);
  });

  // --- Save & Finish ---
  btnFinish.addEventListener("click", async () => {
    const consentState = {
      onboardingCompleted: true,
      eventsEnabled: consentEvents.checked,
      visualEnabled: consentVisual.checked,
      consentTimestamp: new Date().toISOString(),
      isPaused: false,
    };

    // Save consent state to chrome.storage.local
    if (typeof chrome !== "undefined" && chrome.storage) {
      await chrome.storage.local.set(consentState);
      // Notify background service worker
      chrome.runtime.sendMessage({
        type: "CONSENT_UPDATED",
        payload: consentState,
      });
    } else {
      // Fallback for non-extension context (development/testing)
      console.log("[VAI] Consent state (dev mode):", consentState);
      localStorage.setItem("vai_consent", JSON.stringify(consentState));
    }

    // Show success animation
    btnFinish.textContent = "✓ Saved!";
    btnFinish.style.pointerEvents = "none";

    // Close onboarding tab after brief delay
    setTimeout(() => {
      if (typeof chrome !== "undefined" && chrome.runtime) {
        // Try to close the tab
        window.close();
      }
    }, 1500);
  });

  // --- Initialize ---
  goToStep(1);

  // Load any existing consent state
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(
      ["eventsEnabled", "visualEnabled"],
      (result) => {
        if (result.eventsEnabled) {
          consentEvents.checked = true;
          updateToggleUI(consentEvents, toggleEvents);
        }
        if (result.visualEnabled) {
          consentVisual.checked = true;
          updateToggleUI(consentVisual, toggleVisual);
        }
      }
    );
  }
});
