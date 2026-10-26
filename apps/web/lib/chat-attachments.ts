type Attachment = { file: File; voice: boolean; seconds: number; rights: boolean };
const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('sidle-chat-outbox', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('attachments');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Draft storage unavailable'));
  });
export async function attachmentDraft(
  key: string,
  value?: Attachment | null,
): Promise<Attachment | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('attachments', value === undefined ? 'readonly' : 'readwrite');
      const store = tx.objectStore('attachments');
      const request =
        value === undefined
          ? store.get(key)
          : value
            ? store.put({ ...value, savedAt: Date.now() }, key)
            : store.delete(key);
      let result: Attachment | null = null;
      request.onsuccess = () => {
        if (
          value === undefined &&
          request.result &&
          Date.now() - request.result.savedAt < 7 * 86400_000
        )
          result = request.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(new Error('Draft storage unavailable'));
    });
  } finally {
    db.close();
  }
}
