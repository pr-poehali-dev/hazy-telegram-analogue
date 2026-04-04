import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { P2PConnection } from "@/lib/p2p";
import {
  getChatMessages,
  saveMessage,
  type LocalMessage,
} from "@/lib/messageStore";

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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load existing messages
  useEffect(() => {
    getChatMessages(roomCode).then((msgs) => {
      setMessages(msgs);
      setTimeout(scrollToBottom, 100);
    });
  }, [roomCode, scrollToBottom]);

  // Setup P2P connection
  useEffect(() => {
    const handleMessage = (data: {
      id: string;
      text: string;
      senderId: string;
      senderName: string;
      timestamp: string;
    }) => {
      const msg: LocalMessage = {
        id: data.id,
        chatId: roomCode,
        senderId: data.senderId,
        senderName: data.senderName,
        text: data.text,
        timestamp: data.timestamp,
        createdAt: Date.now(),
        isEncrypted: false,
        deliveredVia: "p2p",
      };
      saveMessage(msg).catch(() => {});
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    const handleStatus = (
      status: "connecting" | "connected" | "disconnected"
    ) => {
      setP2pStatus(status);
    };

    const conn = new P2PConnection(
      roomCode,
      myPeerId,
      remotePeerId,
      handleMessage,
      handleStatus
    );
    connRef.current = conn;
    if (role === "creator") {
      conn.initiate();
    } else {
      conn.waitForOffer();
    }

    return () => {
      conn.destroy();
      connRef.current = null;
    };
  }, [roomCode, myPeerId, remotePeerId]);

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || !connRef.current?.connected) return;

    const msgData = {
      id: crypto.randomUUID(),
      text: trimmed,
      senderId: myPeerId,
      senderName: myName,
      timestamp: new Date().toISOString(),
    };

    const sent = connRef.current.send(msgData);
    if (sent) {
      const localMsg: LocalMessage = {
        ...msgData,
        chatId: roomCode,
        createdAt: Date.now(),
        isEncrypted: false,
        deliveredVia: "p2p",
      };
      saveMessage(localMsg).catch(() => {});
      setMessages((prev) => [...prev, localMsg]);
      setText("");
      inputRef.current?.focus();
    }
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
        : "Отключено";

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-border/30">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[var(--hazy-surface)] transition-colors"
        >
          <Icon name="ArrowLeft" size={20} />
        </button>

        <div className="w-9 h-9 rounded-full bg-[var(--hazy-surface)] flex items-center justify-center shrink-0">
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--hazy-amber)" }}
          >
            {remotePeerName.charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {remotePeerName}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${statusColor}`}
              style={
                p2pStatus === "connecting"
                  ? { animation: "pulse-soft 1.5s ease-in-out infinite" }
                  : undefined
              }
            />
            <span className="text-[11px] text-muted-foreground">
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
        {messages.length === 0 && p2pStatus === "connected" && (
          <div className="flex flex-col items-center justify-center h-full text-center -mt-8">
            <Icon
              name="Lock"
              size={20}
              className="text-muted-foreground mb-2"
            />
            <p className="text-xs text-muted-foreground max-w-[220px]">
              Сообщения передаются напрямую через P2P и хранятся только на ваших
              устройствах
            </p>
          </div>
        )}

        {messages.length === 0 && p2pStatus === "connecting" && (
          <div className="flex flex-col items-center justify-center h-full text-center -mt-8">
            <div className="w-10 h-10 rounded-full border-2 border-[var(--hazy-surface)] border-t-[var(--hazy-amber)] animate-spin mb-4" />
            <p className="text-xs text-muted-foreground">
              Устанавливаем P2P соединение...
            </p>
          </div>
        )}

        <div className="space-y-2">
          {messages.map((msg) => {
            const isMine = msg.senderId === myPeerId;
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
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
                  <p
                    className={`text-[10px] mt-1 ${
                      isMine
                        ? "text-muted-foreground/50 text-right"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 shrink-0 border-t border-border/30">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              p2pStatus === "connected"
                ? "Сообщение..."
                : "Ожидание соединения..."
            }
            disabled={p2pStatus !== "connected"}
            className="flex-1 rounded-xl bg-[var(--hazy-surface)] border-0 text-sm px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--hazy-amber-dim)] disabled:opacity-40"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || p2pStatus !== "connected"}
            className="w-11 h-11 rounded-xl bg-[var(--hazy-amber)] text-[#111] flex items-center justify-center shrink-0 disabled:opacity-30 active:scale-95 transition-all"
          >
            <Icon name="Send" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}