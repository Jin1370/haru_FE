"""Subset the landing-page fonts to the glyphs the site actually renders.

Pretendard ships ~11,172 Hangul + Latin + hanja per weight (~780 KB woff2 each,
~3.8 MB across 5 weights). The landing page only ever paints a few hundred
distinct glyphs, so we subset each weight down to exactly the characters that
appear in the rendered content, cutting the font payload ~90 %.

WHAT IT COLLECTS (Pretendard — body/heading, used on every page):
  - every character in messages/{ko,en,ja}.json  (all localized copy)
  - every character in app/**, components/**, lib/**  (.ts/.tsx — catches any
    hard-coded UI string / demo card text, comments included as cheap insurance)
  - a Latin + punctuation + currency safety range (so any Latin name/symbol that
    isn't in the current copy still renders)

Galmuri11 is the pixel logo font, used ONLY by `.font-pixel`: the "haru"
wordmark + the discover card's name/age/nationality. It gets a tiny targeted set.

RE-RUN THIS after changing copy (messages/*.json) or the demo card data, then
commit the regenerated public/fonts/*.woff2. Source of truth = the full TTFs in
haru_FE/assets/fonts/ (never subset those). Requires: fonttools + brotli.
  python scripts/subset-fonts.py
"""

import json
import subprocess
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
SRC_FONTS = WEB.parent / "assets" / "fonts"   # full TTFs (app assets)
OUT_FONTS = WEB / "public" / "fonts"

# Always-keep ranges so Latin text / symbols not in the current copy still work.
SAFETY_UNICODES = ",".join([
    "U+0020-007E",   # Basic Latin (ASCII)
    "U+00A0-00FF",   # Latin-1 Supplement (accented names: é ñ ü …)
    "U+2010-2027",   # general punctuation: – — ' ' " " … ‧
    "U+2030-205E",   # ‰ ′ ″ ‹ › ⁄ …
    "U+2022",        # • bullet
    "U+00B7",        # · middle dot
    "U+20A9",        # ₩ won
    "U+00A5",        # ¥ yen
    "U+20AC",        # € euro
    "U+2192",        # → arrow
])

PRETENDARD_WEIGHTS = {
    "Pretendard-Regular.ttf": "Pretendard-Regular.woff2",
    "Pretendard-Medium.ttf": "Pretendard-Medium.woff2",
    "Pretendard-SemiBold.ttf": "Pretendard-SemiBold.woff2",
    "Pretendard-Bold.ttf": "Pretendard-Bold.woff2",
    "Pretendard-ExtraBold.ttf": "Pretendard-ExtraBold.woff2",
}

# .font-pixel only ever renders these: wordmark + discover card name/age/sep.
GALMURI_TEXT = (
    "".join(chr(c) for c in range(0x20, 0x7F))  # ASCII (haru, JP/KR, digits, y/o)
    + "インドア派새벽세歳"                        # card names + age units (ko/ja)
    + "•·"                                        # separators
)


def collect_pretendard_text() -> str:
    chars: set[str] = set()

    # 1) all localized copy
    for name in ("ko.json", "en.json", "ja.json"):
        data = json.loads((WEB / "messages" / name).read_text(encoding="utf-8"))

        def walk(v):
            if isinstance(v, str):
                chars.update(v)
            elif isinstance(v, dict):
                for x in v.values():
                    walk(x)
            elif isinstance(v, list):
                for x in v:
                    walk(x)

        walk(data)

    # 2) any hard-coded UI string / demo card text in the source
    for base in ("app", "components", "lib"):
        for f in (WEB / base).rglob("*"):
            if f.suffix in (".ts", ".tsx"):
                chars.update(f.read_text(encoding="utf-8", errors="ignore"))

    return "".join(sorted(chars))


def subset(src: Path, out: Path, text: str, unicodes: str) -> None:
    text_file = out.with_suffix(".chars.txt")
    text_file.write_text(text, encoding="utf-8")
    cmd = [
        sys.executable, "-m", "fontTools.subset", str(src),
        f"--text-file={text_file}",
        f"--unicodes={unicodes}",
        "--flavor=woff2",
        "--layout-features=*",
        f"--output-file={out}",
    ]
    subprocess.run(cmd, check=True, cwd=WEB)
    text_file.unlink(missing_ok=True)


def main() -> None:
    OUT_FONTS.mkdir(parents=True, exist_ok=True)
    pre_text = collect_pretendard_text()
    print(f"Pretendard glyph set: {len(set(pre_text))} distinct chars")

    total_before = total_after = 0
    for src_name, out_name in PRETENDARD_WEIGHTS.items():
        src = SRC_FONTS / src_name
        out = OUT_FONTS / out_name
        before = out.stat().st_size if out.exists() else 0
        subset(src, out, pre_text, SAFETY_UNICODES)
        after = out.stat().st_size
        total_before += before
        total_after += after
        print(f"  {out_name}: {before/1024:.0f}KB -> {after/1024:.0f}KB")

    # Galmuri (pixel logo font) — tiny targeted set.
    g_out = OUT_FONTS / "Galmuri11.woff2"
    g_before = g_out.stat().st_size if g_out.exists() else 0
    subset(SRC_FONTS / "Galmuri11.ttf", g_out, GALMURI_TEXT, "U+0020-007E")
    g_after = g_out.stat().st_size
    total_before += g_before
    total_after += g_after
    print(f"  Galmuri11.woff2: {g_before/1024:.0f}KB -> {g_after/1024:.0f}KB")

    print(f"TOTAL: {total_before/1024:.0f}KB -> {total_after/1024:.0f}KB "
          f"({100 - total_after/total_before*100:.0f}% smaller)")


if __name__ == "__main__":
    main()
