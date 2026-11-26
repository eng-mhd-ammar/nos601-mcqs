#!/usr/bin/env python3
"""Regenerate questions.json from Operating_Systems_MCQs.pdf (red = correct answer)."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent
PDF_PATH = ROOT / "Operating_Systems_MCQs.pdf"
OUT_PATH = ROOT / "questions.json"
OLD_PATH = OUT_PATH

RED_RGB = 0xC00000  # PDF marks correct options with this color


def is_red_color(color: int) -> bool:
    if color == RED_RGB:
        return True
    r, g, b = (color >> 16) & 255, (color >> 8) & 255, color & 255
    return r >= 180 and g < 80 and b < 80


def normalize_text(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"\s+", " ", text)
    text = text.replace("–", "-").replace("—", "-")
    return text


def load_hint_map() -> dict[str, str]:
    if not OLD_PATH.is_file():
        return {}
    try:
        with OLD_PATH.open(encoding="utf-8") as f:
            old = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}
    hints: dict[str, str] = {}
    for q in old:
        key = normalize_text(q.get("text", ""))
        hint = (q.get("hint") or "").strip()
        if key and hint and key not in hints:
            hints[key] = hint
    return hints


def extract_lines(doc: fitz.Document) -> list[dict]:
    rows: list[dict] = []
    for page_index in range(doc.page_count):
        page = doc[page_index]
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                text = "".join(span["text"] for span in line["spans"]).strip()
                if not text:
                    continue
                red = any(is_red_color(span["color"]) for span in line["spans"])
                rows.append(
                    {
                        "page": page_index + 1,
                        "y": line["bbox"][1],
                        "text": text,
                        "red": red,
                    }
                )
    rows.sort(key=lambda row: (row["page"], row["y"]))
    return rows


def parse_questions(rows: list[dict]) -> list[dict]:
    q_start = re.compile(r"^(\d+)\.\s+(.*)")
    opt_start = re.compile(r"^([A-Z])\)\s*(.*)")
    page_num = re.compile(r"^\d{1,3}$")

    section = ""
    current: dict | None = None
    questions: list[dict] = []

    def flush() -> None:
        nonlocal current
        if not current or not current.get("text") or not current.get("options"):
            current = None
            return

        answer = current.get("answer", "")
        if not answer:
            red_opts = [o for o in current["options"] if o["red"]]
            if len(red_opts) == 1:
                answer = red_opts[0]["letter"]

        questions.append(
            {
                "section": current["section"],
                "text": current["text"].strip(),
                "options": [
                    {"letter": o["letter"], "text": o["text"].strip()}
                    for o in current["options"]
                ],
                "answer": answer,
            }
        )
        current = None

    for row in rows:
        text = row["text"].strip()
        if page_num.match(text):
            continue

        if "MCQs" in text and (
            "Examradar" in text
            or "Sanfoundry" in text
            or "Set-" in text
            or "Operating" in text
        ):
            flush()
            section = text
            continue

        match_q = q_start.match(text)
        if match_q:
            flush()
            current = {"section": section, "text": match_q.group(2).strip(), "options": []}
            continue

        match_o = opt_start.match(text)
        if match_o and current is not None:
            letter = match_o.group(1)
            option = {
                "letter": letter,
                "text": match_o.group(2).strip(),
                "red": row["red"],
            }
            current["options"].append(option)
            if row["red"]:
                current["answer"] = letter
            continue

        if current is not None:
            if current["options"]:
                last = current["options"][-1]
                last["text"] = (last["text"] + " " + text).strip()
                if row["red"]:
                    last["red"] = True
                    current["answer"] = last["letter"]
            else:
                current["text"] = (current["text"] + " " + text).strip()

    flush()
    return questions


def attach_hints(questions: list[dict], hints: dict[str, str]) -> None:
    default_hint = "راجع الإجابة الملوّنة بالأحمر في ملف PDF."
    for q in questions:
        key = normalize_text(q["text"])
        q["hint"] = hints.get(key, default_hint)


def main() -> int:
    if not PDF_PATH.is_file():
        print(f"Missing PDF: {PDF_PATH}", file=sys.stderr)
        return 1

    hints = load_hint_map()
    doc = fitz.open(PDF_PATH)
    rows = extract_lines(doc)
    questions = parse_questions(rows)

    missing = [q for q in questions if not q.get("answer")]
    if missing:
        print(f"Warning: {len(missing)} question(s) have no red answer in PDF.", file=sys.stderr)

    for i, q in enumerate(questions, start=1):
        q["id"] = i

    attach_hints(questions, hints)

    opt_dist = Counter(len(q["options"]) for q in questions)
    print(f"Parsed {len(questions)} questions. Option counts: {dict(sorted(opt_dist.items()))}")

    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())