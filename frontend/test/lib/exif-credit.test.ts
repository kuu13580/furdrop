import piexif from "piexifjs";
import { describe, expect, it } from "vitest";
import { buildCreditText, embedExifCredit } from "../../src/lib/exif-credit";

/** SOI + APP0(JFIF) + SOS + EOI だけの最小 JPEG。EXIF セグメントは持たない */
function minimalJpeg(): Blob {
  const jfif = [
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
    0x00, 0x00,
  ];
  // piexif の splitIntoSegments は SOS (FFDA) が無いと走査を終えられないので必ず入れる
  const sos = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00];
  return new Blob([new Uint8Array([0xff, 0xd8, ...jfif, ...sos, 0xff, 0xd9])], {
    type: "image/jpeg",
  });
}

/** Blob を piexif が読める binary string 形式の dataURL にする */
async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

async function readIfd0(blob: Blob): Promise<Record<number, unknown>> {
  return piexif.load(await toDataUrl(blob))["0th"] as Record<number, unknown>;
}

describe("buildCreditText", () => {
  it("先頭の @ を落として ASCII 固定の接頭辞を付ける (EXIF の ASCII 欄に収めるため)", () => {
    expect(buildCreditText("@hanako_photo")).toBe("Photo by hanako_photo");
    expect(buildCreditText("  hanako  ")).toBe("Photo by hanako");
  });

  it("名前が無ければ空文字 (匿名送信は記録対象外)", () => {
    expect(buildCreditText(null)).toBe("");
    expect(buildCreditText("@")).toBe("");
  });
});

describe("embedExifCredit", () => {
  it("artist モードは Artist だけを書き、元のカメラ機種名 (Model) を残す", async () => {
    const withModel = await withCameraModel(minimalJpeg(), "SONY ILCE-7M4");

    const out = await embedExifCredit(withModel, "@hanako_photo", "artist");
    const ifd0 = await readIfd0(out);

    expect(ifd0[piexif.ImageIFD.Artist]).toBe("Photo by hanako_photo");
    expect(ifd0[piexif.ImageIFD.Model]).toBe("SONY ILCE-7M4");
  });

  it("artist_model モードは Model も上書きする (Google フォト等で表示させるため)", async () => {
    const withModel = await withCameraModel(minimalJpeg(), "SONY ILCE-7M4");

    const out = await embedExifCredit(withModel, "@hanako_photo", "artist_model");
    const ifd0 = await readIfd0(out);

    expect(ifd0[piexif.ImageIFD.Artist]).toBe("Photo by hanako_photo");
    expect(ifd0[piexif.ImageIFD.Model]).toBe("Photo by hanako_photo");
  });

  it("EXIF セグメントが無い JPEG にも APP1 を挿入できる", async () => {
    const out = await embedExifCredit(minimalJpeg(), "hanako", "artist");
    const ifd0 = await readIfd0(out);
    expect(ifd0[piexif.ImageIFD.Artist]).toBe("Photo by hanako");
  });

  it("none / 匿名 / 非 JPEG は元の Blob をそのまま返す", async () => {
    const jpeg = minimalJpeg();
    expect(await embedExifCredit(jpeg, "@hanako", "none")).toBe(jpeg);
    expect(await embedExifCredit(jpeg, null, "artist")).toBe(jpeg);

    const notJpeg = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]);
    expect(await embedExifCredit(notJpeg, "@hanako", "artist")).toBe(notJpeg);
  });
});

/** piexif で Model 入りの EXIF を持つ JPEG を作る (カメラで撮った写真の代用) */
async function withCameraModel(blob: Blob, model: string): Promise<Blob> {
  const dataUrl = await toDataUrl(blob);
  const exif = piexif.dump({ "0th": { [piexif.ImageIFD.Model]: model }, Exif: {}, GPS: {} });
  const inserted = piexif.insert(exif, dataUrl);
  const binary = atob(inserted.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}
