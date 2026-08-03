import { fetchEpisodes } from "./data.js";
import { setEpisodes, setupFilters } from "./ui.js";
import { requestPersistentStorage } from "./storage.js";
import { initAnalytics } from "./analytics.js";

async function loadEpisodes() {
  try {
    const { episodes, generatedAt } = await fetchEpisodes();
    await setEpisodes(episodes, generatedAt);
    const statusEl = document.getElementById("settings-status");
    if (statusEl) statusEl.textContent = `Loaded ${episodes.length} episode(s).`;
  } catch (err) {
    console.error("Failed to load episodes:", err);
    document.getElementById("episode-list").innerHTML =
      '<p class="error-note">Could not load episode list. Check your connection and try refreshing.</p>';
    const statusEl = document.getElementById("settings-status");
    if (statusEl) statusEl.textContent = `Failed to load: ${err.message}`;
  }
}

async function init() {
  initAnalytics();
  setupFilters();
  window.addEventListener("refresh-requested", loadEpisodes);

  await requestPersistentStorage();
  await loadEpisodes();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  }
}

init();
