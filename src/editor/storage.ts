import { validateDocument, type AlbumDocument } from '../album/document';
export type AssetBlobs = Map<string, Blob>;
export type StoredDraft = { version: number; document: AlbumDocument; assets: AssetBlobs };
export class AlbumConflictError extends Error { constructor() { super('另一标签页已保存新稿。请先导出本页备份，再读取最新草稿，避免覆盖。'); } }
const DB = 'tides-album-v1';
function connect(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let abandoned = false;
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { for (const name of ['drafts', 'assets', 'previews']) request.result.createObjectStore(name); };
    request.onerror = () => reject(request.error ?? new Error('无法打开本机草稿库'));
    request.onblocked = () => { abandoned = true; reject(new Error('草稿库被旧标签页占用，请关闭旧页后重试')); };
    request.onsuccess = () => { const db = request.result; if (abandoned) { db.close(); return; } db.onversionchange = () => db.close(); resolve(db); };
  });
}
function result<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function committed(transaction: IDBTransaction, reason?: () => Error | undefined) {
  return new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = transaction.onerror = () => reject(reason?.() ?? transaction.error ?? new Error('草稿事务未完成')); });
}
export async function readDraft(): Promise<StoredDraft | undefined> {
  const db = await connect();
  try {
    const tx = db.transaction(['drafts', 'assets'], 'readonly'), done = committed(tx);
    const [record, assets, keys] = await Promise.all([result(tx.objectStore('drafts').get('current')), result(tx.objectStore('assets').getAll()), result(tx.objectStore('assets').getAllKeys())]);
    await done;
    if (!record) return undefined;
    return { version: record.version, document: validateDocument(record.document), assets: new Map(keys.map((key, i) => [String(key), assets[i] as Blob])) };
  } finally { db.close(); }
}
/** Compare-and-write in ONE readwrite transaction. Report success after oncomplete. */
export async function saveDraft(document: AlbumDocument, assets: AssetBlobs, expectedVersion: number): Promise<number> {
  const validated = validateDocument(document);
  for (const asset of validated.assets) if (!assets.has(asset.id)) throw new Error(`缺少原素材：${asset.name}`);
  const db = await connect();
  try {
    const tx = db.transaction(['drafts', 'assets'], 'readwrite');
    let error: Error | undefined;
    const done = committed(tx, () => error), request = tx.objectStore('drafts').get('current');
    request.onsuccess = () => {
      if ((request.result?.version ?? 0) !== expectedVersion) { error = new AlbumConflictError(); tx.abort(); return; }
      tx.objectStore('drafts').put({ version: expectedVersion + 1, document: validated }, 'current');
      for (const asset of validated.assets) tx.objectStore('assets').put(assets.get(asset.id)!, asset.id);
      // Keep only the current project's originals on disk; undo keeps its own Blob references in memory.
      const keys = tx.objectStore('assets').getAllKeys();
      keys.onsuccess = () => { const active = new Set(validated.assets.map(asset => asset.id)); for (const key of keys.result) if (!active.has(String(key))) tx.objectStore('assets').delete(key); };
    };
    await done; return expectedVersion + 1;
  } finally { db.close(); }
}
export async function savePreview(document: AlbumDocument, assets: AssetBlobs): Promise<string> {
  const db = await connect(), token = crypto.randomUUID();
  try {
    const tx = db.transaction('previews', 'readwrite'), done = committed(tx), store = tx.objectStore('previews');
    store.put({ document: validateDocument(document), assets: [...assets], created: Date.now() }, token);
    const request = store.getAll();
    request.onsuccess = () => {
      const older = request.result.map((value: any) => value.created).sort((a: number, b: number) => b - a)[2];
      if (older === undefined) return;
      const cursor = store.openCursor(); cursor.onsuccess = () => { const c = cursor.result; if (!c) return; if (c.value.created < older) c.delete(); c.continue(); };
    };
    await done; return token;
  } finally { db.close(); }
}
export async function readPreview(token: string): Promise<{ document: AlbumDocument; assets: AssetBlobs }> {
  if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error('预览编号无效');
  const db = await connect();
  try {
    const tx = db.transaction('previews', 'readonly'), done = committed(tx), record = await result(tx.objectStore('previews').get(token)); await done;
    if (!record) throw new Error('本机预览已过期，请回到工作台重新打开预览。');
    return { document: validateDocument(record.document), assets: new Map(record.assets) };
  } finally { db.close(); }
}
export function watchDraft(onChange: () => void) {
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('tides-album-draft');
  channel?.addEventListener('message', onChange);
  return { changed() { channel?.postMessage('saved'); }, close() { channel?.close(); } };
}
