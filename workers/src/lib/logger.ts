/**
 * Workers Logs 向けの構造化エラーログ。
 *
 * `wrangler.toml` の `[observability.logs] enabled=true` により、ここで出す `console.error`
 * は Cloudflare のダッシュボード(Workers Logs)に記録され、後から検索・追跡できる。
 * JSON 一行で出しておくと、フィールド(scope / path / photoId 等)での絞り込みがしやすい。
 *
 * 外部エラートラッキング(Sentry 等)は導入していないため、これが唯一の観測手段。
 * コンテキスト(どのエンドポイント / どの ID で落ちたか)を必ず添えること。
 */
export function logError(scope: string, err: unknown, context?: Record<string, unknown>): void {
  const error =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { message: String(err) };
  console.error(JSON.stringify({ level: "error", scope, ...context, error }));
}
