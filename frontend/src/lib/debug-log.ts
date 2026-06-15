/**
 * デバッグログ用ヘルパー。
 *
 * `?debug=true`（{@link debugAtom}）のときだけ `console.*` に出力する。
 * 実機（iOS Safari / Android Chrome）で「どの画像がどの工程で落ちたか」を
 * リモートデバッグや Eruda 等のコンソールから追えるようにするのが目的。
 *
 * ## なぜ atom と別にモジュールフラグを持つのか
 * デバッグ状態の一元管理は React 側の {@link debugAtom}（sticky・遷移で保持）が担う。
 * 一方で画像処理パイプライン（image-processing.ts / runPipeline）は React の外側の
 * 純粋な async 関数で、`useAtomValue` を呼べない。そこで App 直下の同期コンポーネントが
 * atom の値をこのモジュールの {@link setDebugEnabled} に流し込み、どこからでも
 * `debugLog.*` を呼べるようにしている。フラグの実体はあくまで atom 側で、ここはミラー。
 */

let enabled = false;

/** debugAtom の値をモジュールフラグに同期する（App 直下の DebugSync が呼ぶ）。 */
export function setDebugEnabled(value: boolean): void {
  enabled = value;
}

/** 現在デバッグ出力が有効かどうか（React 外から参照する用途）。 */
export function isDebugEnabled(): boolean {
  return enabled;
}

const PREFIX = "[FurDrop]";

/**
 * デバッグ時のみ出力するロガー。
 *
 * - `enabled` が false の間は全メソッドが no-op（本番では実質コストゼロ）。
 * - {@link scope} でタグ付きの子ロガーを作れる（例: `debugLog.scope("pipeline")`）。
 * - {@link time} は `console.time` 相当の計測。返り値の関数を呼ぶと経過 ms を出力する。
 */
export class DebugLogger {
  private readonly tag: string;

  constructor(tag = "") {
    this.tag = tag;
  }

  /** タグを連結した子ロガーを作る。例: `debugLog.scope("pipeline").scope("img-3")` */
  scope(tag: string): DebugLogger {
    return new DebugLogger(this.tag ? `${this.tag}:${tag}` : tag);
  }

  private label(): string {
    return this.tag ? `${PREFIX}[${this.tag}]` : PREFIX;
  }

  log(...args: unknown[]): void {
    if (enabled) console.log(this.label(), ...args);
  }

  warn(...args: unknown[]): void {
    if (enabled) console.warn(this.label(), ...args);
  }

  error(...args: unknown[]): void {
    if (enabled) console.error(this.label(), ...args);
  }

  /**
   * エラーを名前・メッセージ・スタックまで展開して出力する。
   * モバイルの remote console では Error がオブジェクトとして潰れて中身が見えない
   * ことがあるため、人が読める形に分解しておく。
   */
  dumpError(message: string, err: unknown): void {
    if (!enabled) return;
    if (err instanceof Error) {
      console.error(this.label(), message, {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
    } else {
      console.error(this.label(), message, err);
    }
  }

  /**
   * 区間計測を開始する。返り値の関数を呼ぶと「ラベル + 経過ms」を log で出力する。
   * Date.now を使わず performance.now を使うので単調増加で安全。
   */
  time(label: string): () => void {
    if (!enabled) return () => {};
    const start = performance.now();
    return () => {
      const ms = Math.round(performance.now() - start);
      this.log(`${label} (${ms}ms)`);
    };
  }
}

/** アプリ共通のルートロガー。`debugLog.scope("...")` で文脈ごとに分岐する。 */
export const debugLog = new DebugLogger();
