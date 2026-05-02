#!/usr/bin/env python3
"""
OG 画像 (1200x630) を生成する。
ロゴと簡易的なタグラインを配置。
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOGO_PATH = ROOT / "src" / "assets" / "logos" / "logo.png"
OUTPUT_PATH = ROOT / "public" / "og.png"

W, H = 1200, 630
BG = (250, 246, 240)  # surface-canvas
INK = (42, 31, 27)
INK_SOFT = (110, 95, 82)
BRAND = (217, 106, 74)
BRAND_TINT = (252, 237, 228)

FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"


def main():
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
    f_sub = ImageFont.truetype(FONT_REG, 28)
    draw.text(
        (80, 220),
        "撮ってもらった写真を、",
        fill=BRAND,
        font=f_sub,
    )

    # メインタグライン (Bold)
    f_main = ImageFont.truetype(FONT_BOLD, 76)
    draw.text(
        (80, 270),
        "ちゃんと受け取る。",
        fill=INK,
        font=f_main,
    )

    # 補足説明
    f_desc = ImageFont.truetype(FONT_REG, 26)
    draw.text(
        (80, 388),
        "メアドもアカウントも交換せずに、",
        fill=INK_SOFT,
        font=f_desc,
    )
    draw.text(
        (80, 426),
        "撮影者情報だけ写真に残せるサービス。",
        fill=INK_SOFT,
        font=f_desc,
    )

    # 底部の URL バッジ
    f_url = ImageFont.truetype(FONT_REG, 22)
    url_text = "furdrop.pages.dev"
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
    draw.text(
        (badge_x + pad_x, badge_y + pad_y - 2),
        url_text,
        fill=(255, 255, 255),
        font=f_url,
    )

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

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUTPUT_PATH, "PNG", optimize=True)
    print(f"Generated: {OUTPUT_PATH} ({W}x{H})")


if __name__ == "__main__":
    main()
