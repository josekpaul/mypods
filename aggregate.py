"""Podcast aggregator: pulls recent episodes from curated RSS feeds,
ranks them by keyword relevance, and writes a Markdown (and optionally
HTML) report grouped by category."""

import argparse
import logging
import os
import sys
from collections import Counter
from datetime import datetime, timezone

from feeds import collect_recent_episodes, load_config
from player_export import render_episodes_json, write_episodes_json
from report import render_html, render_markdown, write_report
from scoring import rank_episodes


def parse_args():
    parser = argparse.ArgumentParser(description="Aggregate recent podcast episodes into a report.")
    parser.add_argument("--config", default="config.json", help="Path to config file (default: config.json)")
    parser.add_argument("--output-dir", default="output", help="Directory to write the report to (default: output)")
    parser.add_argument("--html", action="store_true", help="Also write an HTML copy of the report")
    parser.add_argument("--days", type=int, default=None, help="Override the lookback window in days (default: config's lookback_days)")
    parser.add_argument("--player-data-dir", default="player/data", help="Directory to write episodes.json for the player PWA (default: player/data)")
    return parser.parse_args()


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s", stream=sys.stderr)
    args = parse_args()

    try:
        config = load_config(args.config)
    except (OSError, ValueError) as exc:
        logging.error("Could not load config from %s: %s", args.config, exc)
        return 0

    now = datetime.now(timezone.utc)
    lookback_days = args.days if args.days is not None else config.get("lookback_days", 7)

    episodes, failures = collect_recent_episodes(config, lookback_days=lookback_days, now=now)
    ranked = rank_episodes(episodes, config.get("keywords", {}))

    markdown_report = render_markdown(ranked, failures, now, lookback_days)
    date_str = now.strftime("%Y-%m-%d")
    md_path = write_report(markdown_report, args.output_dir, f"podcast_report_{date_str}.md")

    output_paths = [md_path]
    if args.html:
        html_report = render_html(markdown_report)
        html_path = write_report(html_report, args.output_dir, f"podcast_report_{date_str}.html")
        output_paths.append(html_path)

    episodes_json = render_episodes_json(ranked, now, lookback_days)
    json_path = write_episodes_json(episodes_json, os.path.join(args.player_data_dir, "episodes.json"))
    output_paths.append(json_path)

    counts = Counter(e["category"] for e in ranked)
    print(f"Found {len(ranked)} episode(s) in the last {lookback_days} day(s):")
    for category, count in counts.items():
        print(f"  {category}: {count}")
    if failures:
        print(f"Feed errors: {len(failures)} (see report for details)")
    print("Report written to:")
    for path in output_paths:
        print(f"  {path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
