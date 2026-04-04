import { useState, useRef, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { P2PConnection, sendEnvelope, fetchEnvelopes, ackEnvelopes } from "@/lib/p2p";
import { saveMessage, saveMessages, getChatMessages, LocalMessage } from "@/lib/messageStore";
import { getStoredUser } from "@/lib/api";

interface ConversationProps {
  chatId: string;
  participantId: string;
  participantName: string;
  participantStatus: string;
  currentUserId: string;
  onBack: () => void;
}

export default function Conversation({ chatId, participantId, participantName, participantStatus, currentUserId, onBack }: ConversationProps) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [p2pStatus, setP2pStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const bottomRef = useRef<HTMLDivElement>(null);
  const p2pRef = useRef<P2PConnection | null>(null);
  const envelopePollRef = useRef<ReturnType<typeof setInterval>>();

  const user = getStoredUser();
  const myName = user?.display_name || "Вы";

  const addMessage = useCallback((msg: LocalMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    saveMessage(msg);
  }, []);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const local = await getChatMessages(chatId);
      if (mounted) {
        setMessages(local);
        setLoading(false);
      }

      const envelopes = await fetchEnvelopes(chatId);
      if (envelopes.length > 0 && mounted) {
        const newMsgs: LocalMessage[] = envelopes.map((env: { id: string; chat_id: string; sender_id: string; sender_name: string; text: string; timestamp: string; created_at: string }) => ({
          id: env.id,
          chatId: env.chat_id,
          senderId: env.sender_id,
          senderName: env.sender_name,
          text: env.text,
          timestamp: env.timestamp,
          createdAt: new Date(env.created_at).getTime(),
          isEncrypted: true,
          deliveredVia: "envelope" as const,
        }));
        await saveMessages(newMsgs);
        await ackEnvelopes(envelopes.map((e: { id: string }) => e.id));
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = newMsgs.filter((m) => !existingIds.has(m.id));
          return [...prev, ...fresh];
        });
      }
    };
    init();
    return () => { mounted = false; };
  }, [chatId]);

  useEffect(() => {
    const p2p = new P2PConnection(
      chatId,
      currentUserId,
      participantId,
      (data) => {
        const msg: LocalMessage = {
          id: data.id,
          chatId,
          senderId: data.senderId,
          senderName: data.senderName,
          text: data.text,
          timestamp: data.timestamp,
          createdAt: Date.now(),
          isEncrypted: true,
          deliveredVia: "p2p",
        };
        addMessage(msg);
      },
      (status) => setP2pStatus(status)
    );
    p2pRef.current = p2p;
    p2p.initiate();

    return () => {
      p2p.destroy();
      p2pRef.current = null;
    };
  }, [chatId, currentUserId, participantId, addMessage]);

  useEffect(() => {
    envelopePollRef.current = setInterval(async () => {
      try {
        const envelopes = await fetchEnvelopes(chatId);
        if (envelopes.length > 0) {
          const newMsgs: LocalMessage[] = envelopes.map((env: { id: string; chat_id: string; sender_id: string; sender_name: string; text: string; timestamp: string; created_at: string }) => ({
            id: env.id,
            chatId: env.chat_id,
            senderId: env.sender_id,
            senderName: env.sender_name,
            text: env.text,
            timestamp: env.timestamp,
            createdAt: new Date(env.created_at).getTime(),
            isEncrypted: true,
            deliveredVia: "envelope" as const,
          }));
          await saveMessages(newMsgs);
          await ackEnvelopes(envelopes.map((e: { id: string }) => e.id));
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const fresh = newMsgs.filter((m) => !existingIds.has(m.id));
            if (fresh.length === 0) return prev;
            return [...prev, ...fresh];
          });
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(envelopePollRef.current);
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    const msgId = crypto.randomUUID();
    const now = new Date();
    const timestamp = now.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });

    const localMsg: LocalMessage = {
      id: msgId,
      chatId,
      senderId: currentUserId,
      senderName: myName,
      text,
      timestamp,
      createdAt: now.getTime(),
      isEncrypted: true,
      deliveredVia: "p2p",
    };

    const p2p = p2pRef.current;
    const sentViaP2P = p2p?.connected && p2p.send({
      id: msgId,
      text,
      senderId: currentUserId,
      senderName: myName,
      timestamp,
    });

    if (!sentViaP2P) {
      localMsg.deliveredVia = "envelope";
      try {
        await sendEnvelope(chatId, text);
      } catch {
        setInput(text);
        setSending(false);
        return;
      }
    }

    addMessage(localMsg);
    setSending(false);
  };

  const initials = participantName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const statusBadge = p2pStatus === "connected"
    ? { icon: "Wifi", label: "P2P", color: "text-green-400", bg: "bg-green-400/10" }
    : { icon: "ShieldCheck", label: "E2E", color: "text-[var(--hazy-amber)]", bg: "bg-[var(--hazy-amber-dim)]" };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3 border-b border-border/50 bg-[var(--hazy-surface)]/60 backdrop-blur-sm">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--hazy-surface-hover)] transition-colors"
        >
          <Icon name="ArrowLeft" size={18} />
        </button>

        <div className="w-9 h-9 rounded-full bg-[var(--hazy-surface-active)] flex items-center justify-center text-sm font-semibold text-[var(--hazy-amber)]">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{participantName}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            {participantStatus === "online" && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            )}
            {participantStatus === "online" ? "в сети" : "не в сети"}
          </p>
        </div>

        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${statusBadge.bg}`}>
          <Icon name={statusBadge.icon} size={12} className={statusBadge.color} />
          <span className={`text-[10px] font-medium ${statusBadge.color}`}>{statusBadge.label}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-1.5">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-[var(--hazy-amber)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Icon name="Lock" size={24} className="mb-3 text-[var(--hazy-amber)] opacity-40" />
            <p className="text-sm">Чат зашифрован E2E</p>
            <p className="text-xs mt-1 opacity-60">Сообщения хранятся только на вашем устройстве</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMine={msg.senderId === currentUserId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 py-3 border-t border-border/30">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Сообщение..."
              rows={1}
              className="w-full resize-none py-2.5 px-4 rounded-2xl bg-[var(--hazy-surface)] border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--hazy-amber-dim)] max-h-32"
            />
          </div>
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--hazy-amber)] text-[#111] hover:opacity-90 transition-opacity disabled:opacity-30 flex-shrink-0"
          >
            <Icon name="ArrowUp" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, isMine }: { message: LocalMessage; isMine: boolean }) {
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] px-3.5 py-2 rounded-2xl ${
          isMine
            ? "bg-[var(--hazy-chat-outgoing)] rounded-br-md"
            : "bg-[var(--hazy-chat-incoming)] rounded-bl-md"
        }`}
      >
        <p className="text-sm leading-relaxed break-words">{message.text}</p>
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <Icon
            name={message.deliveredVia === "p2p" ? "Wifi" : "Lock"}
            size={8}
            className={message.deliveredVia === "p2p" ? "text-green-400 opacity-50" : "text-[var(--hazy-amber)] opacity-30"}
          />
          <span className="text-[10px] text-muted-foreground">{message.timestamp}</span>
          {isMine && <Icon name="Check" size={12} className="text-[var(--hazy-amber)]" />}
        </div>
      </div>
    </div>
  );
}
