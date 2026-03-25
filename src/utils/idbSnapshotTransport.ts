import type { ProposalDocumentSnapshot } from "../types";

const DB_NAME = "review-plugin";
const STORE_NAME = "snapshots";
const KEY_LATEST = "latest";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLatestSnapshotToIdb(snapshot: ProposalDocumentSnapshot) {
  if (typeof indexedDB === "undefined") return false;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).put(snapshot, KEY_LATEST);
    });
    return true;
  } finally {
    db.close();
  }
}

export async function loadLatestSnapshotFromIdb(): Promise<ProposalDocumentSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    return await new Promise<ProposalDocumentSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      tx.onerror = () => reject(tx.error);
      const req = tx.objectStore(STORE_NAME).get(KEY_LATEST);
      req.onsuccess = () => resolve((req.result as ProposalDocumentSnapshot) || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function clearLatestSnapshotFromIdb() {
  if (typeof indexedDB === "undefined") return false;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).delete(KEY_LATEST);
    });
    return true;
  } finally {
    db.close();
  }
}

