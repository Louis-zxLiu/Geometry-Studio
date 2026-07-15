from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from pypdf import PdfReader


DEFAULT_YEARS = [2020]
OFFICIAL_SHORTLIST_URL = "https://www.imo-official.org/problems/IMO{year}SL.pdf"


@dataclass
class GeometryProblem:
    source: str
    year: int
    problem_id: str
    title: str
    statement: str
    country: str
    url: str


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "GeometryStudioOlympiadCrawler/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        target.write_bytes(response.read())


def pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def normalize_text(value: str) -> str:
    replacements = {
        "“": "=",
        "˝": "°",
        "掳": "°",
        "ﬁ": "fi",
        "ﬂ": "fl",
        "ﬀ": "ff",
        "铿€": "ff",
        "ă": "<",
        "膬": "<",
        "膮": ">",
        "臎": "≥",
        "鈭?": "∥",
        "蠅": "ω",
        "螕": "Γ",
        "鈩揬n": "ℓ\n",
        "鈩?": "ℓ",
        "麓": "−",
        "´": "−",
        "鈥?": "—",
        "\u00a0": " ",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def extract_geometry_section(text: str) -> str:
    start = text.find("Geometry\nG1.")
    if start < 0:
        start = text.find("Geometry\r\nG1.")
    if start < 0:
        raise RuntimeError("Geometry section not found in shortlist PDF")

    end_candidates = [
        index
        for marker in ["\nNumber Theory\n", "\r\nNumber Theory\r\n"]
        for index in [text.find(marker, start)]
        if index >= 0
    ]
    end = min(end_candidates) if end_candidates else len(text)
    return text[start:end]


def extract_problems(section: str, year: int, url: str) -> list[GeometryProblem]:
    normalized = normalize_text(section)
    matches = list(re.finditer(r"\bG(\d+)\.\s", normalized))
    problems: list[GeometryProblem] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(normalized)
        block = normalized[start:end].strip()
        block = re.sub(r"^G(\d+)\.\s*", "", block, count=1).strip()
        block = re.sub(r"\n?\d+\s+Saint-Petersburg.+?September 2020\n?", "\n", block)
        block = re.sub(r"\n?Shortlisted problems\s+\d+\n?", "\n", block)
        block = re.sub(r"\n?\d+\s+Saint-Petersburg.+?$", "\n", block, flags=re.S)
        block = re.sub(r"\bLetABCD\b", "Let ABCD", block)
        block = re.sub(r"\bat([A-Z])", r"at \1", block)
        block = re.sub(r"\band([A-Z])", r"and \1", block)
        block = re.sub(r"=([A-Z]{3})", r"∠\1", block)
        block = block.replace("perpendicula r", "perpendicular")
        block = block.replace("tria ngle", "triangle")
        country = ""
        country_match = re.search(r"\(([A-Za-z][A-Za-z .-]+)\)\s*$", block)
        if country_match:
            country = country_match.group(1).strip()
            block = block[: country_match.start()].strip()
        problem_id = f"G{match.group(1)}"
        problems.append(
            GeometryProblem(
                source="IMO Shortlist",
                year=year,
                problem_id=problem_id,
                title=f"IMO {year} Shortlist {problem_id}",
                statement=block,
                country=country,
                url=url,
            )
        )
    return problems


def write_markdown(problems: Iterable[GeometryProblem], target: Path) -> None:
    lines = ["# Crawled Olympiad Geometry Problems", ""]
    for problem in problems:
        lines.extend(
            [
                f"## {problem.title}",
                "",
                f"- Source: {problem.source}",
                f"- URL: {problem.url}",
                f"- Country: {problem.country or 'Unknown'}",
                "",
                problem.statement,
                "",
            ]
        )
    target.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def crawl(years: list[int], output_dir: Path) -> list[GeometryProblem]:
    pdf_dir = output_dir / "pdf"
    all_problems: list[GeometryProblem] = []
    for year in years:
        url = OFFICIAL_SHORTLIST_URL.format(year=year)
        pdf_path = pdf_dir / f"IMO{year}SL.pdf"
        download(url, pdf_path)
        section = extract_geometry_section(pdf_text(pdf_path))
        all_problems.extend(extract_problems(section, year, url))
    return all_problems


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Crawl official IMO shortlist geometry problems.")
    parser.add_argument(
        "--years",
        nargs="+",
        type=int,
        default=DEFAULT_YEARS,
        help="IMO shortlist years to crawl.",
    )
    parser.add_argument(
        "--output-dir",
        default="resources/geometry-examples/crawled",
        help="Directory for crawled JSON, Markdown, and source PDFs.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    problems = crawl(args.years, output_dir)
    json_path = output_dir / "imo-shortlist-geometry.json"
    markdown_path = output_dir / "imo-shortlist-geometry.md"
    json_path.write_text(
        json.dumps([asdict(problem) for problem in problems], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    write_markdown(problems, markdown_path)
    print(f"wrote {len(problems)} geometry problems to {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
