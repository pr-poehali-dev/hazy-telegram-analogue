const STORAGE_KEY = "hazy_identity";

export interface Identity {
  peerId: string;
  name: string;
  createdAt: number;
}

export function getIdentity(): Identity | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function createIdentity(name: string): Identity {
  const identity: Identity = {
    peerId: crypto.randomUUID(),
    name: name.trim() || "Аноним",
    createdAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function updateName(name: string) {
  const id = getIdentity();
  if (id) {
    id.name = name.trim() || "Аноним";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(id));
  }
}

export function hasIdentity(): boolean {
  return !!getIdentity();
}
