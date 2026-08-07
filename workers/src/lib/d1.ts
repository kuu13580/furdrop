/** D1 の INTEGER (0/1) カラム値を boolean に正規化する */
export function asBool(v: unknown): boolean {
  return v === 1 || v === true;
}
