#!/usr/bin/env python3
"""Build 九十九里トライアスロン (99T, event `kujukuri`) TSVs from the official PDFs.

    uv run --with pdfplumber python scripts/import-kujukuri-99t.py --year 2026 \
        --md-m 2026_99T_RESULT_MD_AGE_GROUP_M.pdf --md-f 2026_99T_RESULT_MD_AGE_GROUP_F.pdf \
        --od-m 2026_99T_RESULT_SD_AGE_GROUP_M.pdf --od-f 2026_99T_RESULT_SD_AGE_GROUP_F_1006.pdf

Arguments are PDF file names under https://www.99t.jp/result/pdf/ (downloaded
into --cache). In 99T usage "SD" is the スタンダード (OD) course.

2026 SD F was published three times (base, _1005, _1006). _1006 is the
organiser's latest: it corrects bib 9049 (age 24 -> 27, 24歳以下 -> 25-29歳,
with 年代順位 renumbered) and restores 年齢順位, but prints 年齢 only for
finishers. The committed master/2026/kujukuri/od.tsv therefore equals a
_1006 build except that the 25 non-finishing women keep their 年齢 from _1005.

Every athlete appears with a half-width kana 氏名 and, on the next line, the
kanji 氏名. The TSV 氏名 column carries the KANJI name (cross-event matching
needs it); the kana goes into a フリガナ column. Depending on the file, the
kanji line is either its own table row (F layout) or a second line inside the
same row's 氏名 area (M layout, which pdfplumber's extract() collapses to the
first line), so names are always read from the words inside the row's 氏名
x-range.

Column layouts differ between files (detected per page from the header):
  - 年齢 after 氏名: 総合順位 No. 氏名 年齢 総合記録 ... 年代区分 年代順位
    (MD F; SD F _1005)
  - 年齢 at the tail: 総合順位 No. 氏名 総合記録 ... 年代区分 年代順位 年齢 年齢順位
    (MD M, SD M, SD F _1006), with blank / None padding cells in the tail that
    vary by page, so the tail is read as "non-empty values in order".

The PDFs rank each gender separately; one TSV per distance holds both, so (as
in the committed 2025 files) 総合順位 is recomputed across genders by finish
time, and the source's per-gender rank is kept in 男女別順位. Segment ranks
(S順 / B順 / …) stay per-gender, as published.

年代区分 is written as published (男子25-29歳); run
`bun run scripts/fix-age-category-labels.js` afterwards to canonicalise it
(M25-29), which tsv-lint enforces.
"""
import argparse
import re
import unicodedata
import urllib.request
from pathlib import Path

import pdfplumber

BASE = "https://www.99t.jp/result/pdf/"

CORE = ["総合順位", "No.", "氏名", "総合記録", "スイムラップ", "S順", "T1ラップ", "T1順",
        "バイクラップ", "B順", "ｽﾌﾟﾘｯﾄ", "通過", "T2ラップ", "T2順", "ランラップ", "R順",
        "年代区分", "年代順位"]

OUT_HEADER = ["総合順位", "No.", "氏名", "フリガナ", "年齢", "性別", "総合記録",
              "スイムラップ", "S順", "T1ラップ", "T1順", "バイクラップ", "B順", "スプリット", "通過",
              "T2ラップ", "T2順", "ランラップ", "R順", "男女別順位", "年代区分", "年代順位", "年齢順位"]


def cell_lines(page, bbox):
    lines = {}
    for w in page.crop(bbox).extract_words():
        key = round(w["top"])
        k = next((t for t in lines if abs(t - key) <= 2), key)
        lines.setdefault(k, []).append(w)
    return [" ".join(x["text"] for x in sorted(ws, key=lambda w: w["x0"]))
            for _, ws in sorted(lines.items())]


def parse(path):
    athletes = []
    title = None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            if title is None:
                title = (page.extract_text() or "").splitlines()[0]
            tables = page.find_tables()
            if not tables:
                raise SystemExit(f"{path} p{page.page_number}: no table")
            tobj = tables[0]
            table = tobj.extract()
            hdr = [(c or "").replace("\n", "") for c in table[0]]
            if hdr[0] != "総合順位":
                raise SystemExit(f"{path} p{page.page_number}: bad header {hdr}")
            age_first = hdr[3] == "年齢"
            idx = {}
            pos = 0
            for name in CORE:
                while hdr[pos] != name:
                    if not (age_first and hdr[pos] == "年齢"):
                        raise SystemExit(f"{path} p{page.page_number}: expected {name} at {pos}, got {hdr}")
                    pos += 1
                idx[name] = pos
                pos += 1
            tail_from = pos
            name_i = idx["氏名"]

            for r, row in enumerate(table[1:], start=1):
                cells = [(c or "").replace("\n", "") for c in row]
                cell = tobj.rows[r].cells[name_i]
                rb = tobj.rows[r].bbox
                lines = cell_lines(page, (cell[0], rb[1], cell[2], rb[3])) if cell else []
                if len(lines) > 2:
                    raise SystemExit(f"{path} p{page.page_number}: name lines {lines}")
                if not any(c.strip() for i, c in enumerate(cells) if i != name_i):
                    # Name-only row: the previous athlete's kanji line (F layout).
                    text = lines[0] if lines else ""
                    if not athletes or len(lines) > 1 or athletes[-1]["kanji"] not in (None, text):
                        raise SystemExit(f"{path} p{page.page_number}: orphan continuation {cells} {lines}")
                    athletes[-1]["kanji"] = text
                    continue
                rec = {name: cells[i] for name, i in idx.items()}
                rec["kana"] = lines[0] if lines else ""
                rec["kanji"] = lines[1] if len(lines) == 2 else None
                if age_first:
                    rec["年齢"] = cells[3]
                    rec["年齢順位"] = ""
                    if any(c.strip() for c in cells[tail_from:]):
                        raise SystemExit(f"{path}: unexpected tail {cells}")
                else:
                    tail = [c for c in cells[tail_from:] if c.strip()]
                    if len(tail) > 2:
                        raise SystemExit(f"{path}: long tail {cells}")
                    rec["年齢"] = tail[0] if tail else ""
                    rec["年齢順位"] = tail[1] if len(tail) > 1 else ""
                athletes.append(rec)
    return title, athletes


def clean_name(s):
    # Full-width Latin / digits -> half-width, full-width space -> half-width,
    # collapse runs (CLAUDE.md TSV conventions). Kanji and kana are untouched.
    s = re.sub(r"[Ａ-Ｚａ-ｚ０-９]", lambda m: unicodedata.normalize("NFKC", m.group()), s or "")
    return re.sub(r" {2,}", " ", s.replace("\u3000", " ")).strip()


def fetch(name, cache):
    dest = cache / name
    if not dest.exists():
        req = urllib.request.Request(BASE + name, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as res:
            dest.write_bytes(res.read())
    return dest


def seconds(t):
    h, m, s = (int(x) for x in t.split(":"))
    return h * 3600 + m * 60 + s


def build(files, gender_of, year, out_path):
    ranked, unranked = [], []
    for name in files:
        title, athletes = parse(fetch(name, CACHE))
        if str(year) not in title:
            raise SystemExit(f"{name}: title {title!r} is not {year}")
        gender = gender_of[name]
        for a in athletes:
            if a["kanji"] is None:
                # A row the organiser published with no name at all (SD F _1006,
                # DNF 8118) has neither line; a kana name without kanji is a parse bug.
                if a["kana"]:
                    raise SystemExit(f"{name}: no kanji line for {a['No.']} {a['kana']}")
                a["kanji"] = ""
            row = [
                a["総合順位"], a["No."], clean_name(a["kanji"]), a["kana"], a["年齢"], gender,
                a["総合記録"], a["スイムラップ"], a["S順"], a["T1ラップ"], a["T1順"],
                a["バイクラップ"], a["B順"], a["ｽﾌﾟﾘｯﾄ"], a["通過"], a["T2ラップ"], a["T2順"],
                a["ランラップ"], a["R順"], "", a["年代区分"], a["年代順位"], a["年齢順位"],
            ]
            if a["総合順位"].isdigit():
                row[19] = a["総合順位"]
                ranked.append((seconds(a["総合記録"]), files.index(name), int(a["総合順位"]), row))
            else:
                unranked.append(row)
        print(f"{name}: {title} -> {len(athletes)} athletes")
    ranked.sort(key=lambda x: x[:3])
    rows = []
    for i, (_, _, _, row) in enumerate(ranked, start=1):
        row[0] = str(i)
        rows.append(row)
    rows += unranked
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join("\t".join(r) for r in [OUT_HEADER] + rows) + "\n", encoding="utf-8")
    print(f"wrote {out_path}: {len(rows)} rows ({len(ranked)} ranked)")


ap = argparse.ArgumentParser()
ap.add_argument("--year", type=int, required=True)
ap.add_argument("--md-m", required=True)
ap.add_argument("--md-f", required=True)
ap.add_argument("--od-m", required=True)
ap.add_argument("--od-f", required=True)
ap.add_argument("--cache", default="/tmp/99t")
args = ap.parse_args()
CACHE = Path(args.cache)
CACHE.mkdir(parents=True, exist_ok=True)
genders = {args.md_m: "男", args.md_f: "女", args.od_m: "男", args.od_f: "女"}
out_dir = Path(f"master/{args.year}/kujukuri")
build([args.md_m, args.md_f], genders, args.year, out_dir / "md.tsv")
build([args.od_m, args.od_f], genders, args.year, out_dir / "od.tsv")
