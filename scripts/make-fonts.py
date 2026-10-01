"""產生 App 內建字型（放在 app/fonts/，不連外部服務）。

- 思源宋體（Noto Serif TC）500：Big5 常用字 5401 字 + 符號 + App 內所有文字
- 思源宋體 700：只含 App 介面標題用字（檔案很小）
- Cormorant Garamond：英文小標用（一般與斜體）

用法：pip install fonttools brotli && python3 scripts/make-fonts.py
（需要網路，從 Google Fonts 下載原始字型；授權為 SIL Open Font License）
"""

import io
import pathlib
import re
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "fonts"
UA = "Mozilla/5.0"  # 舊版 UA 讓 Google Fonts 回傳完整 TTF


def ttf_urls(family_query):
    url = f"https://fonts.googleapis.com/css2?family={family_query}&display=swap"
    css = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA})).read().decode()
    return re.findall(r"font-weight: (\d+);.*?src: url\((.*?)\)", css, re.S), css


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA})).read()


def big5_common():
    """Big5 第一級常用字（0xA440–0xC67E），約 5401 字"""
    chars = []
    for hi in range(0xA4, 0xC7):
        for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            code = (hi << 8) | lo
            if code < 0xA440 or code > 0xC67E:
                continue
            try:
                chars.append(bytes([hi, lo]).decode("big5"))
            except UnicodeDecodeError:
                pass
    return "".join(chars)


def app_text():
    text = ""
    for p in (ROOT / "app").rglob("*"):
        if p.suffix in {".html", ".js", ".webmanifest"}:
            text += p.read_text(encoding="utf-8")
    return text


PUNCT = "，。、；：？！「」『』（）《》〈〉…⋯—–－～・·．／＼｜＋＝％＃＠＆＊“”‘’※○●◎◇◆□■△▲▽▼☆★♡♥←→↑↓↺↻✳　"
ASCII = "".join(chr(c) for c in range(0x20, 0x7F))


def use_lining_figures(font):
    """Cormorant 預設是舊式數字（高低不一），改成等高的現代數字，畫面與匯出的圖片都一致"""
    if "GSUB" not in font:
        return
    gsub = font["GSUB"].table
    mapping = {}
    for rec in gsub.FeatureList.FeatureRecord:
        if rec.FeatureTag != "lnum":
            continue
        for li in rec.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[li]
            for st in lookup.SubTable:
                st = getattr(st, "ExtSubTable", st)
                mapping.update(getattr(st, "mapping", {}) or {})
    for table in font["cmap"].tables:
        for cp, glyph in list(table.cmap.items()):
            if glyph in mapping:
                table.cmap[cp] = mapping[glyph]


def make(src_bytes, text, out_name, features=None, lining=False):
    font = TTFont(io.BytesIO(src_bytes))
    if lining:
        use_lining_figures(font)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = features or ["kern", "liga", "vert", "vrt2", "palt", "vpal"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    out = OUT / out_name
    font.flavor = "woff2"
    font.save(out)
    print(f"✓ {out_name}  {out.stat().st_size / 1024:.0f} KB")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ui = app_text()
    body = big5_common() + PUNCT + ASCII + "".join(sorted(set(ui)))

    serif, _ = ttf_urls("Noto+Serif+TC:wght@500;700")
    by_weight = {w: u for w, u in serif}
    make(fetch(by_weight["500"]), body, "noto-serif-tc-500.woff2")
    # 粗體只用在介面標題：只放 App 內出現過的字
    make(fetch(by_weight["700"]), PUNCT + ASCII + "".join(sorted(set(ui))), "noto-serif-tc-700.woff2")

    latin = ASCII + "’‘“”—–·•…é"
    for query, name in [
        ("Cormorant+Garamond:wght@500", "cormorant-500.woff2"),
        ("Cormorant+Garamond:ital,wght@1,500", "cormorant-500-italic.woff2"),
    ]:
        urls, _ = ttf_urls(query)
        make(fetch(urls[0][1]), latin, name, lining=True)


if __name__ == "__main__":
    main()
