import urls from "../../backend/func2url.json";

const ROOMS_URL = urls.rooms;

async function api(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers as Record<string, string>) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка");
  return data;
}

export async function createRoom(peerId: string, name: string) {
  return api(`${ROOMS_URL}?action=create`, {
    method: "POST",
    body: JSON.stringify({ peer_id: peerId, name }),
  });
}

export async function joinRoom(code: string, peerId: string, name: string) {
  return api(`${ROOMS_URL}?action=join`, {
    method: "POST",
    body: JSON.stringify({ code, peer_id: peerId, name }),
  });
}

export async function roomStatus(code: string, peerId: string) {
  return api(`${ROOMS_URL}?action=status&code=${code}&peer_id=${peerId}`);
}

export async function sendSignal(code: string, fromPeer: string, toPeer: string, signalType: string, payload: unknown) {
  return api(`${ROOMS_URL}?action=signal`, {
    method: "POST",
    body: JSON.stringify({ code, from_peer_id: fromPeer, to_peer_id: toPeer, signal_type: signalType, payload }),
  });
}

export async function pollSignals(peerId: string, code?: string) {
  const q = code ? `&code=${code}` : "";
  const data = await api(`${ROOMS_URL}?action=poll&peer_id=${peerId}${q}`);
  return data.signals || [];
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type MsgData = { id: string; text: string; senderId: string; senderName: string; timestamp: string };
type MessageHandler = (data: MsgData) => void;
type StatusHandler = (status: "connecting" | "connected" | "disconnected") => void;

export class P2PConnection {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private roomCode: string;
  private myPeerId: string;
  private remotePeerId: string;
  private onMessage: MessageHandler;
  private onStatus: StatusHandler;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private _connected = false;

  constructor(roomCode: string, myPeerId: string, remotePeerId: string, onMessage: MessageHandler, onStatus: StatusHandler) {
    this.roomCode = roomCode;
    this.myPeerId = myPeerId;
    this.remotePeerId = remotePeerId;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  get connected() { return this._connected; }

  async initiate() {
    this.onStatus("connecting");
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.dc = this.pc.createDataChannel("hazy", { ordered: true });
    this.setupDC(this.dc);

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.sig("ice-candidate", e.candidate.toJSON());
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.sig("offer", { sdp: offer.sdp, type: offer.type });
    this.startPolling();
  }

  waitForOffer() {
    this.onStatus("connecting");
    this.startPolling();
  }

  async handleOffer(offer: RTCSessionDescriptionInit) {
    this.onStatus("connecting");
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.ondatachannel = (e) => { this.dc = e.channel; this.setupDC(this.dc); };
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.sig("ice-candidate", e.candidate.toJSON());
    };

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.sig("answer", { sdp: answer.sdp, type: answer.type });
    this.startPolling();
  }

  private setupDC(dc: RTCDataChannel) {
    dc.onopen = () => { this._connected = true; this.onStatus("connected"); };
    dc.onclose = () => { this._connected = false; this.onStatus("disconnected"); };
    dc.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch { /* skip */ } };
  }

  send(msg: MsgData): boolean {
    if (this.dc?.readyState === "open") { this.dc.send(JSON.stringify(msg)); return true; }
    return false;
  }

  private async sig(type: string, payload: unknown) {
    await sendSignal(this.roomCode, this.myPeerId, this.remotePeerId, type, payload).catch(() => {});
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.poll(), 1200);
  }

  private async poll() {
    try {
      const signals = await pollSignals(this.myPeerId, this.roomCode);
      for (const s of signals) {
        if (!this.pc) continue;
        if (s.signal_type === "offer" && !this.dc) {
          await this.handleOffer(s.payload as RTCSessionDescriptionInit);
        } else if (s.signal_type === "answer") {
          await this.pc.setRemoteDescription(new RTCSessionDescription(s.payload as RTCSessionDescriptionInit));
        } else if (s.signal_type === "ice-candidate" && s.payload) {
          await this.pc.addIceCandidate(new RTCIceCandidate(s.payload as RTCIceCandidateInit));
        }
      }
    } catch { /* skip */ }
  }

  destroy() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.dc?.close(); this.dc = null;
    this.pc?.close(); this.pc = null;
    this._connected = false;
  }
}