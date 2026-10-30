const DATABASE = "tideline-records";
const STORE = "music";
const CURRENT_RECORD = "current";

type StoredRecord = { blob: Blob; name: string; lastModified: number };

/** Keep one user-selected audio file locally, without decoding or uploading it. */
export function createRecordStorage() {
  let pending: Promise<unknown> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    // Failed storage must not prevent a later, smaller replacement from saving.
    pending = result.catch(() => undefined);
    return result;
  }

  function connect(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      let finished = false;
      function fail(error: DOMException | null) {
        if (finished) return;
        finished = true;
        reject(error ?? new DOMException("Local music storage is unavailable", "UnknownError"));
      }
      request.onblocked = () => fail(new DOMException("Local music storage is blocked", "InvalidStateError"));
      request.onerror = () => fail(request.error);
      request.onupgradeneeded = () => {
        // A previously blocked request can complete after its caller has moved on.
        if (finished) { request.transaction?.abort(); return; }
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => {
        const database = request.result;
        if (finished) { database.close(); return; }
        finished = true;
        database.onversionchange = () => database.close();
        resolve(database);
      };
    });
  }

  async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await connect();
    try {
      return await new Promise<T>((resolve, reject) => {
        const active = database.transaction(STORE, mode);
        let request: IDBRequest<T>;
        active.oncomplete = () => resolve(request.result);
        active.onabort = () => reject(active.error ?? new DOMException("Local music storage was interrupted", "AbortError"));
        // Request errors abort the transaction; report completion only after commit.
        try { request = operation(active.objectStore(STORE)); }
        catch (error) {
          active.abort();
          reject(error);
        }
      });
    } finally { database.close(); }
  }

  return {
    clear(): Promise<void> {
      return enqueue(async () => { await transaction("readwrite", store => store.delete(CURRENT_RECORD)); });
    },
    read(): Promise<File | undefined> {
      return enqueue(async () => {
        const saved: unknown = await transaction("readonly", store => store.get(CURRENT_RECORD));
        if (!saved || typeof saved !== "object") return;
        const { blob, name, lastModified } = saved as Partial<StoredRecord>;
        if (!(blob instanceof Blob) || !blob.size || typeof name !== "string" || !name.trim()) return;
        return new File([blob], name, {
          type: blob.type,
          lastModified: typeof lastModified === "number" && Number.isFinite(lastModified) ? lastModified : 0,
        });
      });
    },
    save(file: File): Promise<void> {
      return enqueue(async () => {
        if (!file.size) throw new DOMException("The selected audio file is empty", "DataError");
        await transaction("readwrite", store => store.put({
          blob: file,
          name: file.name,
          lastModified: file.lastModified,
        } satisfies StoredRecord, CURRENT_RECORD));
      });
    },
  };
}
