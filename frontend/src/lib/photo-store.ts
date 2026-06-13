/**
 * 送信待ち画像の一時バイト保管庫 (IndexedDB)。
 *
 * モバイルで数十枚の高解像度画像を扱う際、生 File/Blob を JS 側 (state) に
 * 抱え続けると RAM を圧迫し、デコードが EncodingError で失敗する。また Android の
 * content:// 由来 File は時間経過でスナップショットが失効し読めなくなる
 * (NotReadableError / ERR_UPLOAD_FILE_CHANGED)。
 *
 * 対策として、選択直後に bytes を IndexedDB (ディスク管理) へ書き出して content://
 * から切り離し、state には id とメタ情報のみ保持する。プレビュー生成・アップロード
 * 時に必要なぶんだけ取り出すことで、RAM 常駐量を最小化する。
 */
const DB_NAME = "furdrop-uploads";
const STORE = "pending-photos";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    });
  }
  return dbPromise;
}

function runWriteTx(db: IDBDatabase, fn: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexedDB write aborted"));
  });
}

/**
 * bytes を IndexedDB に保存する。content:// 由来の File を渡すと put 時に実体が
 * 読まれてストアにコピーされ、以降は content:// から切り離される。
 */
export async function putPhoto(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await runWriteTx(db, (store) => {
    store.put(blob, id);
  });
}

export async function getPhoto(id: string): Promise<Blob> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => {
      const v = req.result;
      if (v instanceof Blob) resolve(v);
      else reject(new Error(`photo not found in store: ${id}`));
    };
    req.onerror = () => reject(req.error ?? new Error("indexedDB get failed"));
  });
}

export async function deletePhotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  await runWriteTx(db, (store) => {
    for (const id of ids) store.delete(id);
  });
}

/** ストアを空にする。リロードで孤立した前回セッションの bytes を回収する用途。 */
export async function clearAllPhotos(): Promise<void> {
  const db = await openDb();
  await runWriteTx(db, (store) => {
    store.clear();
  });
}
