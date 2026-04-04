import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { P2PConnection } from "@/lib/p2p";
import { sendEnvelope, fetchEnvelopes, ackEnvelopes } from "@/lib/push";
import {
  getChatMessages,
  saveMessage,
  type LocalMessage,
} from "@/lib/messageStore";
import {
  initKeyPair,
  saveRemotePublicKey,
  getRemotePublicKey,
  encryptMessage,
  decryptMessage,
  isEncryptedPayload,
} from "@/lib/crypto";

function safeTime(ts: string): string {
  if (!ts) return new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  const d = new Date(ts);
  if (isNaN(d.getTime())) return new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}

function safeTs(ts: string): number {
  if (!ts) return Date.now();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

interface ConversationProps {
  roomCode: string;
  myPeerId: string;
  myName: string;
  remotePeerId: string;
  remotePeerName: string;
  role: "creator" | "joiner";
  onBack: () => void;
}

export default function Conversation({
  roomCode,
  myPeerId,
  myName,
  remotePeerId,
  remotePeerName,
  role,
  onBack,
}: ConversationProps) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [text, setText] = useState("");
  const [p2pStatus, setP2pStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const connRef = useRef<P2PConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const envelopePollRef = useRef<ReturnType<typeof setInterval>>();
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const msgIdsRef = useRef<Set<string>>(new Set());
  const myKeysRef = useRef<{ publicKey: string; privateKey: string } | null>(null);
  const [remotePublicKey, setRemotePublicKey] = useState<string | null>(() => getRemotePublicKey(remotePeerId));

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const addMessage = useCallback((msg: LocalMessage) => {
    if (msgIdsRef.current.has(msg.id)) return;
    msgIdsRef.current.add(msg.id);
    saveMessage(msg).catch(() => {});
    setMessages((prev) => [...prev, msg]);
  }, []);

  useEffect(() => {
    (async () => {
      const kp = await initKeyPair();
      myKeysRef.current = kp;
      const msgs = await getChatMessages(roomCode);
      const remotePub = getRemotePublicKey(remotePeerId);
      const decrypted: LocalMessage[] = [];
      for (const m of msgs) {
        msgIdsRef.current.add(m.id);
        if (remotePub && isEncryptedPayload(m.text)) {
          try {
            const plain = await decryptMessage(m.text, kp.privateKey, remotePub);
            m.text = plain;
            decrypted.push(m);
          } catch { /* keep as is */ }
        }
      }
      if (decrypted.length > 0) {
        for (const m of decrypted) saveMessage(m).catch(() => {});
      }
      setMessages(msgs);
      setTimeout(scrollToBottom, 100);
    })();
  }, [roomCode, remotePeerId, scrollToBottom]);

  const setupConnection = useCallback(() => {
    if (connRef.current) {
      connRef.current.destroy();
    }

    const conn = new P2PConnection(
      roomCode,
      myPeerId,
      remotePeerId,
      async (data) => {
        let plainText = data.text;
        const remotePub = getRemotePublicKey(remotePeerId);
        const myKeys = myKeysRef.current;
        if (myKeys && remotePub && isEncryptedPayload(data.text)) {
          try {
            plainText = await decryptMessage(data.text, myKeys.privateKey, remotePub);
          } catch { /* fallback */ }
        }
        addMessage({
          id: data.id,
          chatId: roomCode,
          senderId: data.senderId,
          senderName: data.senderName,
          text: plainText,
          timestamp: data.timestamp,
          createdAt: Date.now(),
          isEncrypted: false,
          deliveredVia: "p2p",
        });
      },
      (pubKey) => {
        saveRemotePublicKey(remotePeerId, pubKey);
        setRemotePublicKey(pubKey);
      },
      (status) => {
        setP2pStatus(status);
        if (status === "disconnected") {
          if (reconnectRef.current) clearTimeout(reconnectRef.current);
          reconnectRef.current = setTimeout(() => {
            setupConnection();
          }, 3000);
        }
      }
    );
    connRef.current = conn;
    if (myKeysRef.current) {
      conn.setMyPublicKey(myKeysRef.current.publicKey);
    }
    if (role === "creator") {
      conn.initiate();
    } else {
      conn.waitForOffer();
    }
  }, [roomCode, myPeerId, remotePeerId, role, addMessage]);

  useEffect(() => {
    setupConnection();
    return () => {
      if (connRef.current) connRef.current.destroy();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      connRef.current = null;
    };
  }, [setupConnection]);

  useEffect(() => {
    const checkEnvelopes = async () => {
      try {
        const envelopes = await fetchEnvelopes(myPeerId);
        if (envelopes.length === 0) return;
        const ackIds: string[] = [];
        const remotePub = getRemotePublicKey(remotePeerId);
        const myKeys = myKeysRef.current;
        for (const env of envelopes) {
          if (env.room_code !== roomCode) continue;
          let plainText = env.encrypted_body;
          let decrypted = false;
          if (isEncryptedPayload(env.encrypted_body)) {
            if (myKeys && remotePub) {
              try {
                plainText = await decryptMessage(env.encrypted_body, myKeys.privateKey, remotePub);
                decrypted = true;
              } catch { /* can't decrypt yet, don't ack */ }
            }
            if (!decrypted) continue;
          }
          ackIds.push(env.id);
          addMessage({
            id: env.id,
            chatId: roomCode,
            senderId: env.from_peer_id,
            senderName: env.from_name,
            text: plainText,
            timestamp: safeTime(env.created_at),
            createdAt: safeTs(env.created_at),
            isEncrypted: true,
            deliveredVia: "envelope",
          });
        }
        if (ackIds.length > 0) await ackEnvelopes(myPeerId, ackIds);
      } catch { /* skip */ }
    };
    checkEnvelopes();
    envelopePollRef.current = setInterval(checkEnvelopes, 4000);
    return () => clearInterval(envelopePollRef.current);
  }, [roomCode, myPeerId, remotePeerId, addMessage, remotePublicKey]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const msgId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const localMsg: LocalMessage = {
      id: msgId,
      chatId: roomCode,
      senderId: myPeerId,
      senderName: myName,
      text: trimmed,
      timestamp,
      createdAt: Date.now(),
      isEncrypted: false,
      deliveredVia: "p2p",
    };

    const sentP2P = connRef.current?.connected && connRef.current.send({
      id: msgId,
      text: trimmed,
      senderId: myPeerId,
      senderName: myName,
      timestamp,
    });

    if (!sentP2P) {
      localMsg.deliveredVia = "envelope";
      localMsg.isEncrypted = true;
      try {
        let body = trimmed;
        const remotePub = getRemotePublicKey(remotePeerId);
        const myKeys = myKeysRef.current;
        if (myKeys && remotePub) {
          body = await encryptMessage(trimmed, myKeys.privateKey, remotePub);
        }
        await sendEnvelope(myPeerId, myName, remotePeerId, roomCode, body);
      } catch {
        return;
      }
    }

    addMessage(localMsg);
    setText("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const statusColor =
    p2pStatus === "connected"
      ? "bg-green-500"
      : p2pStatus === "connecting"
        ? "bg-yellow-500"
        : "bg-red-500";

  const statusLabel =
    p2pStatus === "connected"
      ? "P2P"
      : p2pStatus === "connecting"
        ? "Соединение..."
        : "Через сервер";

  const formatTime = (ts: string) => {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) {
        if (/^\d{1,2}:\d{2}$/.test(ts)) return ts;
        return "";
      }
      return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-up">
      <div className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-border/30">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[var(--hazy-surface)] transition-colors"
        >
          <Icon name="ArrowLeft" size={20} />
        </button>

        <div className="w-9 h-9 rounded-full bg-[var(--hazy-surface)] flex items-center justify-center shrink-0">
          <span className="text-sm font-semibold" style={{ color: "var(--hazy-amber)" }}>
            {remotePeerName.charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{remotePeerName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${statusColor}`}
              style={p2pStatus === "connecting" ? { animation: "pulse-soft 1.5s ease-in-out infinite" } : undefined}
            />
            <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
        {messages.length === 0 && p2pStatus === "connected" && (
          <div className="flex flex-col items-center justify-center h-full text-center -mt-8">
            <Icon name="Lock" size={20} className="text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground max-w-[220px]">
              Сообщения передаются напрямую и хранятся только на ваших устройствах
            </p>
          </div>
        )}

        {messages.length === 0 && p2pStatus !== "connected" && (
          <div className="flex flex-col items-center justify-center h-full text-center -mt-8">
            <div className="w-10 h-10 rounded-full border-2 border-[var(--hazy-surface)] border-t-[var(--hazy-amber)] animate-spin mb-4" />
            <p className="text-xs text-muted-foreground">
              {p2pStatus === "connecting" ? "Устанавливаем P2P соединение..." : "Переподключение..."}
            </p>
          </div>
        )}

        <div className="space-y-2">
          {messages.map((msg) => {
            const isMine = msg.senderId === myPeerId;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                    isMine
                      ? "bg-[var(--hazy-chat-outgoing)] rounded-br-md"
                      : "bg-[var(--hazy-chat-incoming)] rounded-bl-md"
                  }`}
                >
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                    {msg.text}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    {msg.deliveredVia === "envelope" && (
                      <Icon name="Cloud" size={8} className="text-muted-foreground/40" />
                    )}
                    <p className={`text-[10px] ${isMine ? "text-muted-foreground/50" : "text-muted-foreground/50"}`}>
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 py-3 shrink-0 border-t border-border/30">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Сообщение..."
            className="flex-1 h-10 rounded-xl bg-[var(--hazy-surface)] border-0 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--hazy-amber-dim)]"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="w-10 h-10 rounded-xl bg-[var(--hazy-amber)] text-[#111] flex items-center justify-center shrink-0 disabled:opacity-30 active:opacity-80 transition-opacity"
          >
            <Icon name="ArrowUp" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}