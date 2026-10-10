import { ScanImage, Finding } from './review';
import { classifyPhone } from './phone';
export type StoredScreenshot = {
  key: string;
  user: string;
  blob: Blob;
  thumbnail?: Blob;
};
function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('number-scanner-evidence', 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('images')) {
        const s = db.createObjectStore('images', { keyPath: 'key' });
        s.createIndex('user', 'user');
      }
      if (!db.objectStoreNames.contains('screenshots'))
        db.createObjectStore('screenshots', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(new Error('Close other Number Scanner tabs to upgrade screenshot storage.'));
  });
}
export async function saveImage(record: ScanImage, screenshot?: StoredScreenshot) {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(screenshot ? ['images', 'screenshots'] : ['images'], 'readwrite');
      try {
        tx.objectStore('images').put(record);
        if (screenshot) tx.objectStore('screenshots').put(screenshot);
      } catch (error) {
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function readImages(user: string) {
  const db = await openStore();
  try {
    return await new Promise<ScanImage[]>((resolve, reject) => {
      const r = db.transaction('images').objectStore('images').index('user').getAll(user);
      r.onsuccess = () =>
        resolve(
          r.result.map((image: ScanImage) => ({
            ...image,

            status: (image.status as string) === 'found' ? 'complete' : image.status,
            results: image.results.map((f: Finding, n: number) => ({
              ...f,
              ...(/low.*confidence/i.test(f.reason) ? classifyPhone(f.original, f.line) : {}),
              id: f.id ?? image.key + ':legacy:' + n,
              reviewState: f.reviewState ?? 'unresolved',
            })),
          })),
        );
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function readScreenshot(key: string, user: string) {
  const db = await openStore();
  try {
    return await new Promise<StoredScreenshot | undefined>((resolve, reject) => {
      const r = db.transaction('screenshots').objectStore('screenshots').get(key);
      r.onsuccess = () => resolve(r.result?.user === user ? r.result : undefined);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function deleteBatch(user: string, batch: string) {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['images', 'screenshots'], 'readwrite');
      const s = tx.objectStore('images');
      const r = s.index('user').openCursor(IDBKeyRange.only(user));
      r.onsuccess = () => {
        const c = r.result;
        if (c) {
          if (c.value.batch === batch) {
            tx.objectStore('screenshots').delete(c.value.key);
            c.delete();
          }
          c.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function makeThumbnail(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const canvas = document.createElement('canvas');
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | undefined>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.7),
    );
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}
