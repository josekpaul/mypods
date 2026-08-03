"""Rendering and writing the podcast report (Markdown and optional HTML)."""

import html
import os
import re

import markdown as markdown_lib

CATEGORY_ORDER = ["Science", "Entertainment", "Art", "Politics"]
SNIPPET_LENGTH = 200


def _clean_snippet(description):
    text = re.sub(r"<[^>]+>", "", description or "")
    text = html.unescape(text).strip()
    if len(text) > SNIPPET_LENGTH:
        text = text[:SNIPPET_LENGTH].rsplit(" ", 1)[0] + "..."
    return text


def render_markdown(episodes, failures, generated_at, lookback_days):
    lines = []
    lines.append("# Podcast Aggregator Report")
    lines.append("")
    lines.append(f"Generated: {generated_at.strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append(f"Window: episodes from the last {lookback_days} day(s)")
    lines.append("")

    by_category = {category: [] for category in CATEGORY_ORDER}
    for episode in episodes:
        by_category.setdefault(episode["category"], []).append(episode)

    for category in CATEGORY_ORDER:
        lines.append(f"## {category}")
        lines.append("")
        category_episodes = by_category.get(category, [])
        if not category_episodes:
            lines.append("_No new episodes this week._")
            lines.append("")
            continue

        for episode in category_episodes:
            date_str = episode["published_dt"].strftime("%Y-%m-%d")
            snippet = _clean_snippet(episode["description"])
            lines.append(
                f"### [{episode['title']}]({episode['link']})"
            )
            lines.append(
                f"*{episode['show_name']} ({episode['network']})* — {date_str} — score: {episode['score']}"
            )
            lines.append("")
            if snippet:
                lines.append(snippet)
                lines.append("")

    if failures:
        lines.append("## Feed Errors")
        lines.append("")
        for failure in failures:
            lines.append(f"- **{failure['show_name']}** ({failure['feed_url']}): {failure['error']}")
        lines.append("")

    return "\n".join(lines)


def render_html(markdown_text):
    body = markdown_lib.markdown(markdown_text)
    return (
        "<!DOCTYPE html>\n"
        '<html><head><meta charset="utf-8">'
        "<title>Podcast Aggregator Report</title></head>\n"
        f"<body>\n{body}\n</body></html>\n"
    )


def write_report(content, output_dir, filename):
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path
