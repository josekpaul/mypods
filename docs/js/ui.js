// DOM rendering: grouped episode list, filters, status badges, player bar.

import { CATEGORY_ORDER, groupByCategory } from "./data.js";
import * as storage from "./storage.js";
import * as player from "./player.js";

let allEpisodes = [];
let filters = { category: "all", downloadedOnly: false, unplayedOnly: false };

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusBadge(state) {
  if (!state) return { label: "Add", className: "status-none" };
  switch (state.download_state) {
    case "downloading":
      return { label: "Downloading…", className: "status-downloading" };
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
  const categoriesToRender = filters.category === "all" ? CATEGORY_ORDER : [filters.category];

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

function renderEpisodeRow(episode, state) {
  const row = document.createElement("article");
  row.className = "episode-row";
  row.dataset.id = episode.id;

  const badge = statusBadge(state);

  row.innerHTML = `
    <div class="episode-main">
      <div class="episode-title">${escapeHtml(episode.title)}</div>
      <div class="episode-meta">${escapeHtml(episode.show_name)} (${escapeHtml(episode.network)}) — ${formatDate(episode.published_at)}</div>
      <div class="episode-desc">${escapeHtml(episode.description)}</div>
    </div>
    <div class="episode-action">
      <button class="action-btn ${badge.className}" ${episode.audio_url ? "" : "disabled"}>${badge.label}</button>
    </div>
  `;

  const button = row.querySelector("button");
  button.addEventListener("click", () => handleAction(episode, state));

  return row;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

async function handleAction(episode, state) {
  if (!state || state.download_state === "not_downloaded" || state.download_state === "failed") {
    await storage.addToPlaylist(episode);
    await renderList();
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

function updateNowPlaying(episode) {
  const bar = document.getElementById("player-bar");
  bar.classList.remove("hidden");
  document.getElementById("now-playing-title").textContent = episode.title;
  document.getElementById("now-playing-show").textContent = episode.show_name;
}

export function setupFilters() {
  const categorySelect = document.getElementById("filter-category");
  for (const category of CATEGORY_ORDER) {
    const opt = document.createElement("option");
    opt.value = category;
    opt.textContent = category;
    categorySelect.appendChild(opt);
  }

  categorySelect.addEventListener("change", () => {
    filters.category = categorySelect.value;
    renderList();
  });

  document.getElementById("filter-downloaded").addEventListener("change", (e) => {
    filters.downloadedOnly = e.target.checked;
    renderList();
  });

  document.getElementById("filter-unplayed").addEventListener("change", (e) => {
    filters.unplayedOnly = e.target.checked;
    renderList();
  });

  document.getElementById("refresh-btn").addEventListener("click", async () => {
    window.dispatchEvent(new CustomEvent("refresh-requested"));
  });
}

export async function setEpisodes(episodes, generatedAt) {
  allEpisodes = episodes;
  document.getElementById("generated-at").textContent = `Updated: ${new Date(generatedAt).toLocaleString()}`;
  await renderList();
}

export async function refreshList() {
  await renderList();
}

player.initPlayer(document.getElementById("audio-el"), renderList);
