// Fetching and parsing episodes.json.

export const CATEGORY_ORDER = ["Science", "Entertainment", "Art", "Politics"];

export async function fetchEpisodes() {
  const response = await fetch(`./data/episodes.json?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch episodes.json: HTTP ${response.status}`);
  }
  const data = await response.json();

  const episodes = [...data.episodes].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.published_at) - new Date(a.published_at);
  });

  return {
    generatedAt: data.generated_at,
    lookbackDays: data.lookback_days,
    episodes,
  };
}

export function groupByCategory(episodes) {
  const groups = {};
  for (const category of CATEGORY_ORDER) groups[category] = [];
  for (const episode of episodes) {
    if (!groups[episode.category]) groups[episode.category] = [];
    groups[episode.category].push(episode);
  }
  return groups;
}
