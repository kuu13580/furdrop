import Button from "./ui/Button";
import Dialog from "./ui/Dialog";

type Props = {
  open: boolean;
  processed: number;
  total: number;
  failed: number;
  onCancel: () => void;
};

export default function BatchDownloadModal({ open, processed, total, failed, onCancel }: Props) {
  const percent = total === 0 ? 0 : Math.min(100, Math.round((processed / total) * 100));
  const done = processed >= total;

  return (
    <Dialog
      open={open}
      onClose={() => undefined}
      title="ZIP を作成中"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={done}>
            中断
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[14px] text-ink-soft">
          選択した写真を1つの ZIP ファイルにまとめています。
        </p>
        <div>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold text-ink">
              {processed} / {total} 枚
            </span>
            <span className="text-ink-muted">{percent}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sand">
            <div
              className="h-full bg-brand transition-all"
              style={{ width: `${percent}%` }}
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              role="progressbar"
            />
          </div>
        </div>
        {failed > 0 && (
          <p className="text-[12px] text-status-danger">
            {failed} 枚の取得に失敗しました (成功分のみ ZIP に含まれます)
          </p>
        )}
      </div>
    </Dialog>
  );
}
