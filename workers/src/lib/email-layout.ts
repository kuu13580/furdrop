/**
 * 通知メールのテキストパートから HTML パートを組み立てる。
 *
 * テンプレート (`src/emails/*.txt`) には HTML を書かせない。文言だけを書いてもらい、
 * 見た目はここが一手に引き受ける — そうしないと同じ文章を text と html の 2 形式で
 * 書くことになり、片方だけ直る事故が必ず起きる。
 *
 * 引き換えに、テンプレートごとに凝ったレイアウトは組めない。サムネイルを載せない
 * 方針 (プライベートな写真を受信箱に置かない / presigned URL が 60 分で切れる) なので、
 * そこに置くものが元々ない。
 */

/** テキスト中の「印」を見た目に昇格させる規則。README.md と対応 */
type Block =
  | { kind: "lead"; text: string }
  | { kind: "cta"; label: string; url: string }
  | { kind: "para"; lines: string[] };

const URL_RE = /https?:\/\/[^\s<]+/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * エスケープ済みテキストの裸 URL をリンクにする (URL 内の & は既に &amp; になっている)。
 *
 * **本文 (lead / para) には使わない。** ダイジェストのリード行には匿名の送信者が自由に
 * 入力した `sender_name` が入るので、そこを自動リンク化すると
 * 「furdrop.app から DKIM 署名付きで届くメールに、攻撃者が指定した URL のリンクが載る」
 * というフィッシング経路になる。正規のリンクは CTA ボタンとフッターで賄えている。
 */
function autolink(escaped: string, color: string): string {
  return escaped.replace(
    URL_RE,
    (u) => `<a href="${u}" style="color:${color};text-decoration:underline;">${u}</a>`,
  );
}

export function parseBlocks(body: string): Block[] {
  const chunks = body.trim().split(/\n\s*\n/);
  const blocks: Block[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;

    if (lines.every((l) => l.startsWith("> "))) {
      blocks.push({ kind: "lead", text: lines.map((l) => l.slice(2)).join(" ") });
      continue;
    }

    // 字下げしたラベル + 字下げした URL の 2 行だけなら CTA ボタン
    const indented = lines.length === 2 && lines.every((l) => /^\s{2,}\S/.test(l));
    if (indented) {
      const label = lines[0].trim();
      const url = lines[1].trim();
      if (/^https?:\/\/\S+$/.test(url)) {
        blocks.push({ kind: "cta", label, url });
        continue;
      }
    }

    blocks.push({ kind: "para", lines });
  }

  return blocks;
}

const CREAM = "#FAF6F0";
const SURFACE = "#FFFFFF";
const BORDER = "#EAE1D3";
const ESPRESSO = "#2A1F1B";
const MOCHA = "#6E5F52";
const CORAL = "#D96A4A";

// Web フォントはメールクライアントでほぼ読み込まれないので端末のシステムフォントに任せる
const FONT =
  "-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP','Yu Gothic',Meiryo,'Segoe UI',Roboto,sans-serif";

function renderBlock(b: Block): string {
  switch (b.kind) {
    case "lead":
      return `<p style="margin:0 0 20px;font-size:19px;line-height:1.6;font-weight:600;color:${ESPRESSO};letter-spacing:-0.005em;">${escapeHtml(b.text)}</p>`;
    case "cta":
      return [
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">`,
        `<tr><td bgcolor="${CORAL}" style="border-radius:12px;">`,
        `<a href="${escapeHtml(b.url)}" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:15px;font-weight:500;line-height:1;color:#FFFFFF;text-decoration:none;">${escapeHtml(b.label)}</a>`,
        `</td></tr></table>`,
      ].join("");
    case "para":
      return `<p style="margin:0 0 20px;font-size:15px;line-height:1.75;color:${ESPRESSO};">${b.lines.map((l) => escapeHtml(l)).join("<br>")}</p>`;
  }
}

/**
 * フッターの `ラベル: URL` 行。HTML ではラベルだけをリンクにする。
 * 解除 URL はトークンを含んで長くなるので、そのまま出すと折り返して読めなくなる。
 * テキストパートではリンクを張れないので `ラベル: URL` のまま残す。
 */
function renderFooterLine(line: string): string {
  const m = /^(.*?):\s*(https?:\/\/\S+)$/.exec(line);
  if (!m) return autolink(escapeHtml(line), MOCHA);
  const [, label, url] = m;
  return `<a href="${escapeHtml(url)}" style="color:${MOCHA};text-decoration:underline;">${escapeHtml(label)}</a>`;
}

/**
 * 本文とフッターを HTML メールに仕立てる。
 *
 * テーブル + インラインスタイルで書いているのは Outlook が flexbox / grid を解さないため。
 * ロゴは画像ではなくテキスト — 画像をブロックするクライアントで差出人が分からなくなるのと、
 * 外部ドメインの画像が電気通信事業法 27 条の 12 (外部送信規律) をグレーにするため。
 */
export function wrapHtml(body: string, footer: string | null): string {
  const blocks = parseBlocks(body).map(renderBlock).join("\n");
  const footerHtml = footer
    ? `<tr><td style="padding:24px 32px 28px;border-top:1px solid ${BORDER};">` +
      footer
        .trim()
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map(
          (l) =>
            `<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${MOCHA};">${renderFooterLine(l.trim())}</p>`,
        )
        .join("") +
      `</td></tr>`
    : "";

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:${CREAM};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:${SURFACE};border:1px solid ${BORDER};border-radius:12px;font-family:${FONT};">
<tr><td style="padding:28px 32px 0;">
<p style="margin:0 0 24px;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${ESPRESSO};">FurDrop</p>
</td></tr>
<tr><td style="padding:0 32px 8px;">
${blocks}
</td></tr>
${footerHtml}
</table>
</td></tr>
</table>
</body>
</html>`;
}
