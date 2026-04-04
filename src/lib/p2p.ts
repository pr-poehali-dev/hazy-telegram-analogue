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

export async function createRoom(peerId: string, name: string, publicKey?: string) {
  return api(`${ROOMS_URL}?action=create`, {
    method: "POST",
    body: JSON.stringify({ peer_id: peerId, name, public_key: publicKey || "" }),
  });
}

export async function joinRoom(code: string, peerId: string, name: string, publicKey?: string) {
  return api(`${ROOMS_URL}?action=join`, {
    method: "POST",
    body: JSON.stringify({ code, peer_id: peerId, name, public_key: publicKey || "" }),
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
type KeyExchangeData = { type: "key_exchange"; publicKey: string };
type MessageHandler = (data: MsgData) => void;
type KeyHandler = (publicKey: string) => void;
type StatusHandler = (status: "connecting" | "connected" | "disconnected") => void;

export class P2PConnection {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private roomCode: string;
  private myPeerId: string;
  private remotePeerId: string;
  private onMessage: MessageHandler;
  private onKey: KeyHandler;
  private onStatus: StatusHandler;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private _connected = false;
  private myPublicKey: string | null = null;

  constructor(roomCode: string, myPeerId: string, remotePeerId: string, onMessage: MessageHandler, onKey: KeyHandler, onStatus: StatusHandler) {
    this.roomCode = roomCode;
    this.myPeerId = myPeerId;
    this.remotePeerId = remotePeerId;
    this.onMessage = onMessage;
    this.onKey = onKey;
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

  setMyPublicKey(key: string) {
    this.myPublicKey = key;
    if (this._connected && this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify({ type: "key_exchange", publicKey: key } as KeyExchangeData));
    }
  }

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;

  private setupDC(dc: RTCDataChannel) {
    dc.onopen = () => {
      this._connected = true;
      this.lastPong = Date.now();
      this.onStatus("connected");
      if (this.myPublicKey) {
        dc.send(JSON.stringify({ type: "key_exchange", publicKey: this.myPublicKey } as KeyExchangeData));
      }
      this.startPing();
    };
    dc.onclose = () => {
      this.stopPing();
      this._connected = false;
      this.onStatus("disconnected");
    };
    dc.onerror = () => {
      this.stopPing();
      this._connected = false;
      this.onStatus("disconnected");
    };
    dc.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "ping") {
          dc.send(JSON.stringify({ type: "pong" }));
          return;
        }
        if (data.type === "pong") {
          this.lastPong = Date.now();
          return;
        }
        if (data.type === "key_exchange" && data.publicKey) {
          this.onKey(data.publicKey);
        } else {
          this.onMessage(data);
        }
      } catch { /* skip */ }
    };
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.dc?.readyState === "open") {
        this.dc.send(JSON.stringify({ type: "ping" }));
        if (Date.now() - this.lastPong > 8000) {
          this._connected = false;
          this.onStatus("disconnected");
          this.stopPing();
        }
      }
    }, 3000);
  }

  private stopPing() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  send(msg: MsgData): boolean {
    if (this.dc?.readyState === "open" && this._connected) { this.dc.send(JSON.stringify(msg)); return true; }
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
        if (s.signal_type === "offer") {
          await this.handleOffer(s.payload as RTCSessionDescriptionInit);
        } else if (s.signal_type === "answer" && this.pc) {
          await this.pc.setRemoteDescription(new RTCSessionDescription(s.payload as RTCSessionDescriptionInit));
        } else if (s.signal_type === "ice-candidate" && s.payload && this.pc) {
          await this.pc.addIceCandidate(new RTCIceCandidate(s.payload as RTCIceCandidateInit));
        }
      }
    } catch { /* skip */ }
  }

  destroy() {
    this.stopPing();
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.dc?.close(); this.dc = null;
    this.pc?.close(); this.pc = null;
    this._connected = false;
  }
}