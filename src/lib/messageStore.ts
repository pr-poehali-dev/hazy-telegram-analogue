const DB_NAME = "hazy_messages";
const DB_VERSION = 1;
const STORE_NAME = "messages";

export interface LocalMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  createdAt: number;
  isEncrypted: boolean;
  deliveredVia: "p2p" | "envelope";
  status?: "sending" | "sent" | "delivered";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("chatId", "chatId", { unique: false });
        store.createIndex("chatId_createdAt", ["chatId", "createdAt"], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveMessage(msg: LocalMessage): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(msg);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveMessages(msgs: LocalMessage[]): Promise<void> {
  if (msgs.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const msg of msgs) {
      store.put(msg);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getChatMessages(chatId: string): Promise<LocalMessage[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("chatId");
    const req = index.getAll(chatId);
    req.onsuccess = () => {
      const msgs = req.result as LocalMessage[];
      msgs.sort((a, b) => a.createdAt - b.createdAt);
      resolve(msgs);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getChatsWithLastMessage(): Promise<Record<string, LocalMessage>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result as LocalMessage[];
      const map: Record<string, LocalMessage> = {};
      for (const msg of all) {
        if (!map[msg.chatId] || msg.createdAt > map[msg.chatId].createdAt) {
          map[msg.chatId] = msg;
        }
      }
      resolve(map);
    };
    req.onerror = () => reject(req.error);
  });
}

const LAST_READ_PREFIX = "hazy_last_read_";

export function markChatRead(chatId: string) {
  localStorage.setItem(LAST_READ_PREFIX + chatId, String(Date.now()));
}

export function getLastReadTimestamp(chatId: string): number {
  const raw = localStorage.getItem(LAST_READ_PREFIX + chatId);
  return raw ? Number(raw) : 0;
}

export async function getUnreadCounts(myPeerId: string): Promise<Record<string, number>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const all = req.result as LocalMessage[];
      const counts: Record<string, number> = {};
      for (const msg of all) {
        if (msg.senderId === myPeerId) continue;
        const lastRead = getLastReadTimestamp(msg.chatId);
        if (msg.createdAt > lastRead) {
          counts[msg.chatId] = (counts[msg.chatId] || 0) + 1;
        }
      }
      resolve(counts);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearChatMessages(chatId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const index = tx.objectStore(STORE_NAME).index("chatId");
    const req = index.openCursor(chatId);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}