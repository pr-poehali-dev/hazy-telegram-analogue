import { useState, useRef, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { getMessages, sendMessage, markRead } from "@/lib/api";

interface ApiMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_name: string;
  text: string;
  is_read: boolean;
  is_encrypted: boolean;
  timestamp: string;
}

interface ConversationProps {
  chatId: string;
  participantName: string;
  participantStatus: string;
  currentUserId: string;
  onBack: () => void;
}

export default function Conversation({ chatId, participantName, participantStatus, currentUserId, onBack }: ConversationProps) {
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const loadMessages = useCallback(async () => {
    try {
      const msgs = await getMessages(chatId);
      setMessages(msgs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    loadMessages();
    markRead(chatId).catch(() => {});
    pollRef.current = setInterval(loadMessages, 3000);
    return () => clearInterval(pollRef.current);
  }, [chatId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    try {
      const msg = await sendMessage(chatId, text);
      setMessages((prev) => [...prev, { ...msg, sender_name: "Вы", is_read: false, is_encrypted: true }]);
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const statusText = participantStatus === "online" ? "в сети" : "не в сети";

  const initials = participantName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

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
            {statusText}
          </p>
        </div>

        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--hazy-amber-dim)]">
          <Icon name="ShieldCheck" size={12} className="text-[var(--hazy-amber)]" />
          <span className="text-[10px] text-[var(--hazy-amber)] font-medium">E2E</span>
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
            <p className="text-xs mt-1 opacity-60">Напишите первое сообщение</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMine={msg.sender_id === currentUserId}
            delay={i * 15}
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

function MessageBubble({ message, isMine, delay }: { message: ApiMessage; isMine: boolean; delay: number }) {
  return (
    <div
      className={`flex ${isMine ? "justify-end" : "justify-start"} animate-fade-up`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={`max-w-[75%] px-3.5 py-2 rounded-2xl ${
          isMine
            ? "bg-[var(--hazy-chat-outgoing)] rounded-br-md"
            : "bg-[var(--hazy-chat-incoming)] rounded-bl-md"
        }`}
      >
        <p className="text-sm leading-relaxed break-words">{message.text}</p>
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <Icon name="Lock" size={8} className="text-[var(--hazy-amber)] opacity-30" />
          <span className="text-[10px] text-muted-foreground">{message.timestamp}</span>
          {isMine && (
            <Icon
              name={message.is_read ? "CheckCheck" : "Check"}
              size={12}
              className={message.is_read ? "text-[var(--hazy-amber)]" : "text-muted-foreground"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
