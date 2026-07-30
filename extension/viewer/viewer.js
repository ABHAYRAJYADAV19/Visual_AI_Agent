/**
 * Visual Activity Agent — Data Viewer Script
 */

const API_BASE_URL = "http://localhost:8000";

document.addEventListener("DOMContentLoaded", async () => {
  const loading = document.getElementById("loading");
  const content = document.getElementById("content");
  
  if (typeof chrome === "undefined" || !chrome.storage) {
    loading.textContent = "Error: Not running in extension context.";
    return;
  }

  try {
    const { apiKey } = await chrome.storage.local.get("apiKey");
    if (!apiKey) {
      loading.textContent = "Error: Extension not registered yet.";
      return;
    }

    const res = await fetch(`${API_BASE_URL}/data/me`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);
    
    const data = await res.json();
    
    // Update UI
    document.getElementById("total-events").textContent = data.total_events || 0;
    document.getElementById("total-screenshots").textContent = data.total_screenshots || 0;
    
    const tbody = document.getElementById("table-body");
    if (data.recent_activities && data.recent_activities.length > 0) {
      data.recent_activities.forEach(activity => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><span class="badge">${activity.activity}</span></td>
          <td>${activity.category}</td>
          <td>${activity.summary}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No AI annotations available yet.</td></tr>`;
    }
    
    loading.style.display = "none";
    content.style.display = "block";
    
  } catch (error) {
    console.error("[VAI] Failed to load data:", error);
    loading.textContent = "Failed to securely connect to backend. Is the server running?";
  }
});
