#!/usr/bin/env python3
"""
OG 画像 (1200x630) を日本語 / 英語で生成する。

英語版は広告のクリエイティブと `/en/` の OGP 用。レイアウトは共通で、
文字列だけロケールごとに差し替える。英語は日本語より横に長くなるため、
主要な行は指定幅に収まるまでフォントサイズを落として描画する。

    python3 frontend/scripts/generate-og.py
"""

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO_PATH = ROOT / "src" / "assets" / "logos" / "logo.png"
OUTPUT_DIR = ROOT / "public"

W, H = 1200, 630
BG = (250, 246, 240)  # surface-canvas
INK = (42, 31, 27)
INK_SOFT = (110, 95, 82)
BRAND = (217, 106, 74)
BRAND_TINT = (252, 237, 228)

FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

# 右側はアクセント円とポラロイドの領域。テキストはここまでに収める。
# 日本語の既存レイアウト (メイン 684px) をそのまま保てる幅にしてある
TEXT_MAX_W = 700


@dataclass(frozen=True)
class Copy:
    filename: str
    sub: str
    main: str
    desc: tuple[str, ...]
    main_size: int


COPIES = (
    Copy(
        filename="og.png",
        sub="撮ってもらった写真を、",
        main="ちゃんと受け取る。",
        desc=("メアドもアカウントも交換せずに、", "撮影者情報だけ写真に残せるサービス。"),
        main_size=76,
    ),
    Copy(
        filename="og-en.png",
        sub="Someone took photos of you.",
        main="Actually get them.",
        desc=("No emails, no accounts —", "just photos, with the credit intact."),
        main_size=76,
    ),
)


def fitted_font(draw, text, path, size, max_width):
    """max_width に収まるまでフォントサイズを落とす (英語の長い行対策)"""
    while size > 24:
        font = ImageFont.truetype(path, size)
        if draw.textlength(text, font=font) <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(path, size)


def render(copy: Copy) -> Path:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # 右上に大きな円形のアクセント (brand-tint)
    accent_r = 380
    accent = Image.new("RGBA", (accent_r * 2, accent_r * 2), (0, 0, 0, 0))
    ad = ImageDraw.Draw(accent)
    ad.ellipse((0, 0, accent_r * 2, accent_r * 2), fill=(*BRAND_TINT, 200))
    img.paste(accent, (W - accent_r - 80, -accent_r // 2), accent)

    # 左上にロゴ
    logo = Image.open(LOGO_PATH).convert("RGBA")
    logo_h = 110
    logo_w = int(logo.width * (logo_h / logo.height))
    logo_resized = logo.resize((logo_w, logo_h), Image.LANCZOS)
    img.paste(logo_resized, (80, 70), logo_resized)

    # ヒーロー手書き風サブコピー (Caveat フォントが無いので Sans で代替)
    f_sub = fitted_font(draw, copy.sub, FONT_REG, 28, TEXT_MAX_W)
    draw.text((80, 220), copy.sub, fill=BRAND, font=f_sub)

    # メインタグライン (Bold)
    f_main = fitted_font(draw, copy.main, FONT_BOLD, copy.main_size, TEXT_MAX_W)
    draw.text((80, 270), copy.main, fill=INK, font=f_main)

    # 補足説明
    for i, line in enumerate(copy.desc):
        f_desc = fitted_font(draw, line, FONT_REG, 26, TEXT_MAX_W)
        draw.text((80, 388 + i * 38), line, fill=INK_SOFT, font=f_desc)

    # 底部の URL バッジ
    f_url = ImageFont.truetype(FONT_REG, 22)
    url_text = "furdrop.app"
    bbox = draw.textbbox((0, 0), url_text, font=f_url)
    url_w = bbox[2] - bbox[0]
    pad_x, pad_y = 18, 10
    badge_x = 80
    badge_y = H - 80
    draw.rounded_rectangle(
        (badge_x, badge_y, badge_x + url_w + pad_x * 2, badge_y + 24 + pad_y * 2),
        radius=8,
        fill=BRAND,
    )
    draw.text((badge_x + pad_x, badge_y + pad_y - 2), url_text, fill=(255, 255, 255), font=f_url)

    # 右下に装飾的なポラロイド風枠 (簡易)
    pol_w, pol_h = 220, 250
    pol_x = W - pol_w - 90
    pol_y = H - pol_h - 90
    pol = Image.new("RGBA", (pol_w, pol_h), (255, 255, 255, 255))
    pd = ImageDraw.Draw(pol)
    pd.rectangle((12, 12, pol_w - 12, pol_h - 60), fill=(241, 232, 219))
    # 影
    shadow = Image.new("RGBA", (pol_w + 20, pol_h + 20), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rectangle((10, 10, pol_w + 10, pol_h + 10), fill=(42, 31, 27, 30))
    rotated_shadow = shadow.rotate(-6, expand=True, resample=Image.BICUBIC)
    rotated = pol.rotate(-6, expand=True, resample=Image.BICUBIC)
    img.paste(rotated_shadow, (pol_x - 30, pol_y - 30), rotated_shadow)
    img.paste(rotated, (pol_x - 20, pol_y - 20), rotated)

    out = OUTPUT_DIR / copy.filename
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)
    return out


def main():
    for copy in COPIES:
        out = render(copy)
        print(f"Generated: {out} ({W}x{H})")


if __name__ == "__main__":
    main()
