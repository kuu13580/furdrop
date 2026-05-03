import { atom } from "jotai";

/**
 * デバッグモードのグローバルフラグ。
 *
 * - URL のクエリ `?debug=true` で ON、`?debug=false` で OFF。クエリ不在では変更しない（sticky）。
 * - 同期は App 直下の DebugUrlSync コンポーネントが担当する。
 * - 各画面はこの atom を読み取るだけで良い。
 *
 * ページ遷移で URL からクエリが落ちても atom の値は保持されるため、
 * 例: /upload?debug=true → navigate('/uploading') 後も debug 表示が残る。
 */
export const debugAtom = atom(false);
