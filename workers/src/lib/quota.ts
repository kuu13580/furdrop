/** クォータ加算 (アトミック)。超過時は false を返す */
export async function addStorageUsage(
  db: D1Database,
  receiverId: string,
  bytes: number,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `UPDATE users
       SET storage_used = storage_used + ?, updated_at = ?
       WHERE id = ? AND storage_used + ? <= storage_quota`,
    )
    .bind(bytes, now, receiverId, bytes)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** クォータ減算 (削除時) */
export async function subtractStorageUsage(
  db: D1Database,
  receiverId: string,
  bytes: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE users
       SET storage_used = MAX(0, storage_used - ?), updated_at = ?
       WHERE id = ?`,
    )
    .bind(bytes, now, receiverId)
    .run();
}
