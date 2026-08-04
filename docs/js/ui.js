// DOM rendering: grouped episode list, filters, status badges, player bar.

import { getCategoryOrder, groupByCategory } from "./data.js";
import * as storage from "./storage.js";
import * as player from "./player.js";
import * as settings from "./settings.js";
import { trackEvent, setAnalyticsRuntimeEnabled } from "./analytics.js";

let allEpisodes = [];
let filters = { category: "all", downloadedOnly: false, unplayedOnly: false };

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function reviewSearchUrl(episode) {
  const query = `${episode.show_name} ${episode.title} review`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function statusBadge(state) {
  if (!state) return { label: "Add", className: "status-none" };
  switch (state.download_state) {
    case "downloading": {
      const pct = state.download_progress;
      const label = pct > 0 ? `Downloading… ${pct}%` : "Downloading…";
      return { label, className: "status-downloading" };
    }
    case "downloaded":
      return state.played
        ? { label: "Played", className: "status-played" }
        : { label: "Play", className: "status-ready" };
    case "failed":
      return { label: "Retry", className: "status-failed" };
    default:
      return state.played
        ? { label: "Played", className: "status-played" }
        : { label: "Add", className: "status-none" };
  }
}

async function renderList() {
  const container = document.getElementById("episode-list");
  container.innerHTML = "";

  const states = await storage.getAllEpisodeStates();
  const stateMap = new Map(states.map((s) => [s.id, s]));

  let filtered = allEpisodes;
  if (filters.category !== "all") {
    filtered = filtered.filter((e) => e.category === filters.category);
  }
  if (filters.downloadedOnly) {
    filtered = filtered.filter((e) => stateMap.get(e.id)?.download_state === "downloaded");
  }
  if (filters.unplayedOnly) {
    filtered = filtered.filter((e) => !stateMap.get(e.id)?.played);
  }

  const grouped = groupByCategory(filtered);
  const categoriesToRender = filters.category === "all" ? getCategoryOrder(allEpisodes) : [filters.category];

  for (const category of categoriesToRender) {
    const episodes = grouped[category] || [];
    if (episodes.length === 0 && filters.category === "all") continue;

    const section = document.createElement("section");
    section.className = "category-section";

    const heading = document.createElement("h2");
    heading.textContent = category;
    section.appendChild(heading);

    if (episodes.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "No episodes match the current filters.";
      section.appendChild(empty);
    }

    for (const episode of episodes) {
      const state = stateMap.get(episode.id);
      section.appendChild(renderEpisodeRow(episode, state));
    }

    container.appendChild(section);
  }
}

function renderEpisodeRow(episode, state, options = {}) {
  const row = document.createElement("article");
  row.className = "episode-row";
  row.dataset.id = episode.id;

  const badge = statusBadge(state);
  const hasFullText = episode.description_full && episode.description_full !== episode.description;

  row.innerHTML = `
    ${episode.show_image_url
      ? `<img class="episode-art" src="${escapeHtml(episode.show_image_url)}" alt="" loading="lazy" onerror="this.remove()">`
      : ""}
    <div class="episode-main">
      <div class="episode-title">${escapeHtml(episode.title)}</div>
      <div class="episode-meta">${escapeHtml(episode.show_name)} (${escapeHtml(episode.network)}) — ${formatDate(episode.published_at)}</div>
      <div class="episode-reviews"><a href="${reviewSearchUrl(episode)}" target="_blank" rel="noopener noreferrer">Search for reviews</a></div>
      <div class="episode-desc">${escapeHtml(episode.description)}</div>
      ${hasFullText ? '<button class="desc-toggle">Read more</button>' : ""}
    </div>
    <div class="episode-action">
      <button class="action-btn ${badge.className}" ${episode.audio_url ? "" : "disabled"}>${badge.label}</button>
    </div>
  `;

  if (hasFullText) {
    const descEl = row.querySelector(".episode-desc");
    const toggle = row.querySelector(".desc-toggle");
    let expanded = false;
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      descEl.textContent = expanded ? episode.description_full : episode.description;
      descEl.classList.toggle("expanded", expanded);
      toggle.textContent = expanded ? "Show less" : "Read more";
    });
  }

  const button = row.querySelector(".action-btn");
  button.addEventListener("click", () => handleAction(episode, state, button, options.onChange));

  if (options.removable) {
    const remove = document.createElement("button");
    remove.className = "remove-btn";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      await storage.removeDownload(episode.id);
      if (options.onChange) await options.onChange();
    });
    row.querySelector(".episode-action").appendChild(remove);
  }

  return row;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

async function handleAction(episode, state, button, onChange) {
  const refresh = onChange || renderList;
  if (!state || state.download_state === "not_downloaded" || state.download_state === "failed") {
    button.disabled = true;
    button.textContent = "Downloading…";
    button.className = "action-btn status-downloading";
    trackEvent("add_to_playlist", { show_name: episode.show_name, category: episode.category });
    await storage.addToPlaylist(episode, (pct) => {
      button.textContent = pct > 0 && pct < 100 ? `Downloading… ${pct}%` : "Downloading…";
    });
    const finalState = await storage.getEpisodeState(episode.id);
    if (finalState?.download_state === "downloaded") {
      trackEvent("download_success", { show_name: episode.show_name, category: episode.category });
    } else if (finalState?.download_state === "failed") {
      trackEvent("download_failed", { show_name: episode.show_name, category: episode.category, network: episode.network });
    }
    await refresh();
    return;
  }
  if (state.download_state === "downloading") {
    return;
  }
  if (state.download_state === "downloaded") {
    await player.playEpisode(episode);
    updateNowPlaying(episode);
    return;
  }
}

function playlistSortValue(state) {
  return state.playlist_order !== undefined
    ? state.playlist_order
    : new Date(state.added_to_playlist_at).getTime();
}

async function getSortedPlaylist() {
  const states = await storage.getAllEpisodeStates();
  const inPlaylist = states.filter((s) => s.download_state !== "not_downloaded" && !s.played);
  inPlaylist.sort((a, b) => playlistSortValue(a) - playlistSortValue(b));
  return inPlaylist;
}

async function renderPlaylist() {
  const container = document.getElementById("playlist-list");
  container.innerHTML = "";

  const inPlaylist = await getSortedPlaylist();

  if (inPlaylist.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "Nothing in your playlist yet. Add episodes from the Browse tab.";
    container.appendChild(empty);
    return;
  }

  const orderedIds = inPlaylist.map((s) => s.id);

  for (let i = 0; i < inPlaylist.length; i++) {
    const state = inPlaylist[i];
    // The episodes store already holds a full snapshot of episode fields,
    // so the playlist renders straight from IndexedDB — no dependency on
    // episode.json still listing it (episodes age out of the lookback window).
    const row = renderEpisodeRow(state, state, {
      onChange: renderPlaylist,
      removable: state.download_state === "downloaded",
    });

    const reorderControls = document.createElement("div");
    reorderControls.className = "reorder-controls";

    const upBtn = document.createElement("button");
    upBtn.className = "reorder-btn";
    upBtn.textContent = "▲";
    upBtn.setAttribute("aria-label", "Move up");
    upBtn.disabled = i === 0;
    upBtn.addEventListener("click", async () => {
      [orderedIds[i - 1], orderedIds[i]] = [orderedIds[i], orderedIds[i - 1]];
      await storage.reorderPlaylist(orderedIds);
      await renderPlaylist();
    });

    const downBtn = document.createElement("button");
    downBtn.className = "reorder-btn";
    downBtn.textContent = "▼";
    downBtn.setAttribute("aria-label", "Move down");
    downBtn.disabled = i === inPlaylist.length - 1;
    downBtn.addEventListener("click", async () => {
      [orderedIds[i], orderedIds[i + 1]] = [orderedIds[i + 1], orderedIds[i]];
      await storage.reorderPlaylist(orderedIds);
      await renderPlaylist();
    });

    reorderControls.appendChild(upBtn);
    reorderControls.appendChild(downBtn);
    row.prepend(reorderControls);

    container.appendChild(row);
  }
}

async function playNextInPlaylist(finishedId) {
  if (!settings.isContinuousPlayEnabled()) return;

  const inPlaylist = await getSortedPlaylist();
  const finishedIndex = inPlaylist.findIndex((s) => s.id === finishedId);
  const searchStart = finishedIndex === -1 ? 0 : finishedIndex + 1;

  for (let i = searchStart; i < inPlaylist.length; i++) {
    const candidate = inPlaylist[i];
    if (candidate.download_state === "downloaded" && !candidate.played) {
      await player.playEpisode(candidate);
      updateNowPlaying(candidate);
      await renderActiveView();
      return;
    }
  }
}

function setActiveView(view) {
  const views = {
    browse: { list: document.getElementById("episode-list"), tab: document.getElementById("tab-browse") },
    playlist: { list: document.getElementById("playlist-view"), tab: document.getElementById("tab-playlist") },
    settings: { list: document.getElementById("settings-view"), tab: document.getElementById("tab-settings") },
  };
  const browseFilters = document.getElementById("browse-filters");

  for (const [name, { list, tab }] of Object.entries(views)) {
    const isActive = name === view;
    list.classList.toggle("hidden", !isActive);
    tab.classList.toggle("active", isActive);
  }
  browseFilters.classList.toggle("hidden", view !== "browse");

  if (view === "playlist") renderPlaylist();
  if (view === "settings") renderSettings();
}

function renderSettings() {
  const input = document.getElementById("settings-feed-url");
  const currentUrl = settings.getFeedUrl();
  input.value = settings.isDefaultFeedUrl(currentUrl) ? "" : currentUrl;
  document.getElementById("settings-status").textContent = "";
  document.getElementById("settings-analytics-toggle").checked = settings.isAnalyticsEnabled();
}

function updateNowPlaying(episode) {
  const bar = document.getElementById("player-bar");
  bar.classList.remove("hidden");
  document.getElementById("now-playing-title").textContent = episode.title;
  document.getElementById("now-playing-show").textContent = episode.show_name;
}

export function setupFilters() {
  document.getElementById("tab-browse").addEventListener("click", () => setActiveView("browse"));
  document.getElementById("tab-playlist").addEventListener("click", () => setActiveView("playlist"));
  document.getElementById("tab-settings").addEventListener("click", () => setActiveView("settings"));

  document.getElementById("settings-save-btn").addEventListener("click", () => {
    const input = document.getElementById("settings-feed-url");
    settings.setFeedUrl(input.value);
    document.getElementById("settings-status").textContent = "Saved. Reloading list…";
    window.dispatchEvent(new CustomEvent("refresh-requested"));
  });

  document.getElementById("settings-reset-btn").addEventListener("click", () => {
    settings.resetFeedUrl();
    document.getElementById("settings-feed-url").value = "";
    document.getElementById("settings-status").textContent = "Reset to default. Reloading list…";
    window.dispatchEvent(new CustomEvent("refresh-requested"));
  });

  document.getElementById("settings-analytics-toggle").addEventListener("change", (e) => {
    settings.setAnalyticsEnabled(e.target.checked);
    setAnalyticsRuntimeEnabled(e.target.checked);
  });

  const categorySelect = document.getElementById("filter-category");
  categorySelect.addEventListener("change", () => {
    filters.category = categorySelect.value;
    renderList();
  });

  const downloadedChip = document.getElementById("filter-downloaded");
  downloadedChip.addEventListener("click", () => {
    filters.downloadedOnly = !filters.downloadedOnly;
    downloadedChip.classList.toggle("active", filters.downloadedOnly);
    downloadedChip.setAttribute("aria-pressed", String(filters.downloadedOnly));
    renderList();
  });

  const unplayedChip = document.getElementById("filter-unplayed");
  unplayedChip.addEventListener("click", () => {
    filters.unplayedOnly = !filters.unplayedOnly;
    unplayedChip.classList.toggle("active", filters.unplayedOnly);
    unplayedChip.setAttribute("aria-pressed", String(filters.unplayedOnly));
    renderList();
  });

  document.getElementById("refresh-btn").addEventListener("click", async () => {
    window.dispatchEvent(new CustomEvent("refresh-requested"));
  });

  const continuousPlayToggle = document.getElementById("continuous-play-toggle");
  continuousPlayToggle.checked = settings.isContinuousPlayEnabled();
  continuousPlayToggle.addEventListener("change", (e) => {
    settings.setContinuousPlayEnabled(e.target.checked);
  });
}

function populateCategoryDropdown(episodes) {
  const categorySelect = document.getElementById("filter-category");
  const previousValue = categorySelect.value || "all";

  categorySelect.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All categories";
  categorySelect.appendChild(allOpt);

  for (const category of getCategoryOrder(episodes)) {
    const opt = document.createElement("option");
    opt.value = category;
    opt.textContent = category;
    categorySelect.appendChild(opt);
  }

  const stillValid = [...categorySelect.options].some((opt) => opt.value === previousValue);
  categorySelect.value = stillValid ? previousValue : "all";
  filters.category = categorySelect.value;
}

export async function setEpisodes(episodes, generatedAt) {
  allEpisodes = episodes;
  document.getElementById("generated-at").textContent = `Updated: ${new Date(generatedAt).toLocaleString()}`;
  populateCategoryDropdown(episodes);
  await renderList();
}

export async function refreshList() {
  await renderList();
}

async function renderActiveView() {
  const playlistVisible = !document.getElementById("playlist-view").classList.contains("hidden");
  if (playlistVisible) {
    await renderPlaylist();
  } else {
    await renderList();
  }
}

player.initPlayer(document.getElementById("audio-el"), renderActiveView, playNextInPlaylist);
