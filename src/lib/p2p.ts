import urls from "../../backend/func2url.json";

const MESSAGES_URL = urls.messages;

function getToken(): string | null {
  return localStorage.getItem("hazy_token");
}

async function apiRequest(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  return res.json();
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type MessageHandler = (data: { text: string; senderId: string; senderName: string; timestamp: string; id: string }) => void;
type StatusHandler = (status: "connecting" | "connected" | "disconnected") => void;

export class P2PConnection {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private chatId: string;
  private userId: string;
  private peerId: string;
  private onMessage: MessageHandler;
  private onStatus: StatusHandler;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private _connected = false;

  constructor(chatId: string, userId: string, peerId: string, onMessage: MessageHandler, onStatus: StatusHandler) {
    this.chatId = chatId;
    this.userId = userId;
    this.peerId = peerId;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  get connected() {
    return this._connected;
  }

  async initiate() {
    this.onStatus("connecting");
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.dc = this.pc.createDataChannel("hazy-msg", { ordered: true });
    this.setupDataChannel(this.dc);

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignal("ice-candidate", e.candidate.toJSON());
      }
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.sendSignal("offer", { sdp: offer.sdp, type: offer.type });

    this.startSignalPolling();
  }

  async handleOffer(offer: RTCSessionDescriptionInit) {
    this.onStatus("connecting");
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.ondatachannel = (e) => {
      this.dc = e.channel;
      this.setupDataChannel(this.dc);
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignal("ice-candidate", e.candidate.toJSON());
      }
    };

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.sendSignal("answer", { sdp: answer.sdp, type: answer.type });

    this.startSignalPolling();
  }

  private setupDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => {
      this._connected = true;
      this.onStatus("connected");
    };
    dc.onclose = () => {
      this._connected = false;
      this.onStatus("disconnected");
    };
    dc.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this.onMessage(data);
      } catch {
        // ignore
      }
    };
  }

  send(msg: { text: string; senderId: string; senderName: string; timestamp: string; id: string }) {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  private async sendSignal(signalType: string, payload: unknown) {
    await apiRequest(`${MESSAGES_URL}?action=signal_send`, {
      method: "POST",
      body: JSON.stringify({
        chat_id: this.chatId,
        to_user_id: this.peerId,
        signal_type: signalType,
        payload,
      }),
    });
  }

  private startSignalPolling() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => this.pollSignals(), 1500);
  }

  private async pollSignals() {
    try {
      const data = await apiRequest(`${MESSAGES_URL}?action=signal_poll`);
      if (!data.signals) return;

      for (const sig of data.signals) {
        if (sig.chat_id !== this.chatId) continue;
        if (!this.pc) continue;

        if (sig.signal_type === "offer" && !this.dc) {
          await this.handleOffer(sig.payload as RTCSessionDescriptionInit);
        } else if (sig.signal_type === "answer") {
          await this.pc.setRemoteDescription(new RTCSessionDescription(sig.payload as RTCSessionDescriptionInit));
        } else if (sig.signal_type === "ice-candidate" && sig.payload) {
          await this.pc.addIceCandidate(new RTCIceCandidate(sig.payload as RTCIceCandidateInit));
        }
      }
    } catch {
      // ignore
    }
  }

  destroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this._connected = false;
  }
}

export async function sendEnvelope(chatId: string, text: string) {
  return apiRequest(`${MESSAGES_URL}?action=envelope_store_raw`, {
    method: "POST",
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function fetchEnvelopes(chatId?: string) {
  const q = chatId ? `&chat_id=${chatId}` : "";
  const data = await apiRequest(`${MESSAGES_URL}?action=envelope_fetch${q}`);
  return data.envelopes || [];
}

export async function ackEnvelopes(ids: string[]) {
  if (ids.length === 0) return;
  return apiRequest(`${MESSAGES_URL}?action=envelope_ack`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export async function heartbeat() {
  return apiRequest(`${MESSAGES_URL}?action=heartbeat`, { method: "POST" });
}

export async function pollSignals() {
  const data = await apiRequest(`${MESSAGES_URL}?action=signal_poll`);
  return data.signals || [];
}
