"""Keyword-based relevance scoring and ranking of episodes."""

TITLE_WEIGHT = 2
DESCRIPTION_WEIGHT = 1


def score_episode(episode, keywords):
    category_keywords = keywords.get(episode["category"], [])
    title = episode["title"].lower()
    description = episode["description"].lower()

    score = 0
    for keyword in category_keywords:
        kw = keyword.lower()
        score += title.count(kw) * TITLE_WEIGHT
        score += description.count(kw) * DESCRIPTION_WEIGHT

    return score


def rank_episodes(episodes, keywords):
    scored = []
    for episode in episodes:
        episode = dict(episode)
        episode["score"] = score_episode(episode, keywords)
        scored.append(episode)

    scored.sort(key=lambda e: (-e["score"], -e["published_dt"].timestamp()))
    return scored
