import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import type { ExifCreditMode } from "../lib/exif-credit";
import Button from "./ui/Button";
import Dialog from "./ui/Dialog";

const OPTIONS: { value: ExifCreditMode; label: MessageDescriptor; hint: MessageDescriptor }[] = [
  {
    value: "none",
    label: msg`記録しない`,
    hint: msg`届いたままのファイルを保存します`,
  },
  {
    value: "artist",
    label: msg`撮影者 (Artist) 欄に記録`,
    hint: msg`Lightroom や Adobe Bridge などで表示されます。元のカメラ情報はそのまま残ります`,
  },
  {
    value: "artist_model",
    label: msg`カメラ機種 (Model) 欄にも記録`,
    hint: msg`Google フォトや iPhone の写真アプリでも表示されます。元のカメラ機種名は上書きされます`,
  },
];

/**
 * DL 導線からダイアログを開くボタン。ラベルはダイアログのタイトルと揃える
 * (現在値を出すと「撮影者名: 撮影者+機種欄」のような読み解きの要る文字列になるため)。
 */
export function DownloadOptionsTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useLingui();
  return (
    <button
      type="button"
      onClick={onClick}
      title={t`ダウンロード時に撮影者名を記録するかを設定する`}
      className="rounded-lg px-2 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:bg-surface-sand hover:text-ink"
    >
      <Trans>ダウンロードオプション</Trans>
      <span aria-hidden="true"> ▾</span>
    </button>
  );
}

type Props = {
  open: boolean;
  /** confirm: 初回 DL の確認として開いた / edit: 設定変更として開いた */
  purpose: "confirm" | "edit";
  value: ExifCreditMode;
  onClose: () => void;
  onSubmit: (next: ExifCreditMode) => void;
};

/**
 * R17: DL する写真の EXIF に送信者名を記録するかを選ばせるダイアログ。
 *
 * 受信オプション (R14) とは別物で、受信者が自分の手元のコピーをどう保存するかの設定。
 * 初回 DL のときに一度だけ自動で開き、以降は DL 導線のトグルから開く。
 */
export default function DownloadOptionsDialog({ open, purpose, value, onClose, onSubmit }: Props) {
  const { t, i18n } = useLingui();
  const [selected, setSelected] = useState<ExifCreditMode>(value);

  useEffect(() => {
    if (open) setSelected(value);
  }, [open, value]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t`ダウンロードオプション`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            <Trans>キャンセル</Trans>
          </Button>
          <Button variant="primary" onClick={() => onSubmit(selected)}>
            {purpose === "confirm" ? t`ダウンロード` : t`保存`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[14px] text-ink">
          <Trans>ダウンロードする写真に、撮影者名を記録しますか？</Trans>
        </p>

        <div role="radiogroup" aria-label={t`撮影者名の記録`} className="space-y-2">
          {OPTIONS.map((opt) => {
            const checked = selected === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                  checked
                    ? "border-brand bg-brand-tint"
                    : "border-surface-sand-deep hover:bg-surface-sand"
                }`}
              >
                <input
                  type="radio"
                  name="download-exif-credit"
                  value={opt.value}
                  checked={checked}
                  onChange={() => setSelected(opt.value)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-ink">
                    {i18n._(opt.label)}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-[1.5] text-ink-soft">
                    {i18n._(opt.hint)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <p className="rounded-xl bg-surface-sand px-3.5 py-3 text-[12px] leading-[1.6] text-ink-soft">
          <Trans>
            記録されるのは「Photo by
            撮影者名」の形式です。ダウンロードするファイルにだけ書き込まれ、 FurDrop
            に保存されている写真は変わりません。
          </Trans>
        </p>
      </div>
    </Dialog>
  );
}
