const STORAGE_PREFIX = "hazy_key_";

export interface KeyPairData {
  publicKey: string;
  privateKey: string;
}

function ab2b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b642ab(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function generateKeyPair(): Promise<KeyPairData> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
  const pubRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  return {
    publicKey: ab2b64(pubRaw),
    privateKey: JSON.stringify(privJwk),
  };
}

export function getOrCreateKeyPair(): KeyPairData {
  const stored = localStorage.getItem("hazy_ecdh_keys");
  if (stored) return JSON.parse(stored);
  return null as unknown as KeyPairData;
}

export async function initKeyPair(): Promise<KeyPairData> {
  const stored = localStorage.getItem("hazy_ecdh_keys");
  if (stored) return JSON.parse(stored);
  const kp = await generateKeyPair();
  localStorage.setItem("hazy_ecdh_keys", JSON.stringify(kp));
  return kp;
}

async function deriveSharedKey(myPrivateKeyJwk: string, remotePubKeyB64: string): Promise<CryptoKey> {
  const privJwk = JSON.parse(myPrivateKeyJwk);
  const privateKey = await crypto.subtle.importKey(
    "jwk", privJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"]
  );
  const pubRaw = b642ab(remotePubKeyB64);
  const publicKey = await crypto.subtle.importKey(
    "raw", pubRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function getSharedKeyStorageId(remotePeerId: string): string {
  return STORAGE_PREFIX + remotePeerId;
}

export function saveRemotePublicKey(remotePeerId: string, publicKey: string) {
  localStorage.setItem(getSharedKeyStorageId(remotePeerId), publicKey);
}

export function getRemotePublicKey(remotePeerId: string): string | null {
  return localStorage.getItem(getSharedKeyStorageId(remotePeerId));
}

export async function encryptMessage(text: string, myPrivateKeyJwk: string, remotePubKeyB64: string): Promise<string> {
  const sharedKey = await deriveSharedKey(myPrivateKeyJwk, remotePubKeyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    encoded
  );
  const payload = {
    iv: ab2b64(iv.buffer),
    ct: ab2b64(ciphertext),
  };
  return JSON.stringify(payload);
}

export async function decryptMessage(encrypted: string, myPrivateKeyJwk: string, remotePubKeyB64: string): Promise<string> {
  const { iv, ct } = JSON.parse(encrypted);
  const sharedKey = await deriveSharedKey(myPrivateKeyJwk, remotePubKeyB64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b642ab(iv) },
    sharedKey,
    b642ab(ct)
  );
  return new TextDecoder().decode(decrypted);
}

export function isEncryptedPayload(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed.iv === "string" && typeof parsed.ct === "string";
  } catch {
    return false;
  }
}
