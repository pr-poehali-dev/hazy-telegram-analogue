import urls from "../../backend/func2url.json";

const ROOMS_URL = urls.rooms;

async function api(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers as Record<string, string>) },
  });
  return res.json();
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    return reg;
  } catch {
    return null;
  }
}

export async function getVapidPublicKey(): Promise<string> {
  const data = await api(`${ROOMS_URL}?action=vapid_public`);
  return data.vapid_public_key || "";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(peerId: string): Promise<boolean> {
  const reg = await registerServiceWorker();
  if (!reg) return false;

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const json = subscription.toJSON();
    await api(`${ROOMS_URL}?action=push_subscribe`, {
      method: "POST",
      body: JSON.stringify({
        peer_id: peerId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh || "",
        auth: json.keys?.auth || "",
      }),
    });

    return true;
  } catch {
    return false;
  }
}

export async function sendEnvelope(fromPeerId: string, fromName: string, toPeerId: string, roomCode: string, encryptedBody: string) {
  return api(`${ROOMS_URL}?action=envelope_send`, {
    method: "POST",
    body: JSON.stringify({
      from_peer_id: fromPeerId,
      from_name: fromName,
      to_peer_id: toPeerId,
      room_code: roomCode,
      encrypted_body: encryptedBody,
    }),
  });
}

export async function fetchEnvelopes(peerId: string) {
  const data = await api(`${ROOMS_URL}?action=envelope_fetch&peer_id=${peerId}`);
  return data.envelopes || [];
}

export async function ackEnvelopes(peerId: string, ids: string[]) {
  if (ids.length === 0) return;
  return api(`${ROOMS_URL}?action=envelope_ack`, {
    method: "POST",
    body: JSON.stringify({ peer_id: peerId, ids }),
  });
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true;
}
