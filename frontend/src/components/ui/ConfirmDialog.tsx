import type { ReactNode } from "react";
import Button from "./Button";
import Dialog from "./Dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger: 削除・ログアウト等の destructive 操作。primary: 通常の確認 */
  variant?: "danger" | "primary";
  /** onConfirm 実行中の loading 状態 (呼び出し側で制御) */
  loading?: boolean;
};

/**
 * Destructive / 重要操作の確認ダイアログ。
 *
 * DESIGN.md §8 Interaction - Destructive Confirm に準拠:
 * - ログアウト、削除、取り消し不可操作は必ずこのダイアログを挟む
 * - native window.confirm() は使用しない (ブラウザデフォルトスタイルでブランドが崩れるため)
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "OK",
  cancelLabel = "キャンセル",
  variant = "primary",
  loading = false,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {description && <div className="text-[14px] leading-[1.6] text-ink">{description}</div>}
    </Dialog>
  );
}
