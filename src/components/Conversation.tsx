import { useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { Chat, Message } from "@/types/chat";
import { chatMessages } from "@/data/mockData";

interface ConversationProps {
  chat: Chat;
  onBack: () => void;
}

export default function Conversation({ chat, onBack }: ConversationProps) {
  const [messages, setMessages] = useState<Message[]>(chatMessages[chat.id] || []);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    const msg: Message = {
      id: `m-${Date.now()}`,
      chatId: chat.id,
      senderId: "me",
      text: input.trim(),
      timestamp: new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }),
      isRead: false,
      isEncrypted: true,
    };
    setMessages((prev) => [...prev, msg]);
    setInput("");
  };

  const statusText =
    chat.participant.status === "online"
      ? "в сети"
      : chat.participant.lastSeen || "не в сети";

  const initials = chat.participant.name
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
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--hazy-surface-hover)] transition-colors md:hidden"
        >
          <Icon name="ArrowLeft" size={18} />
        </button>
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full items-center justify-center hover:bg-[var(--hazy-surface-hover)] transition-colors hidden md:flex"
        >
          <Icon name="ArrowLeft" size={18} />
        </button>

        <div className="w-9 h-9 rounded-full bg-[var(--hazy-surface-active)] flex items-center justify-center text-sm font-semibold text-[var(--hazy-amber)]">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{chat.participant.name}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            {chat.participant.status === "online" && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            )}
            {statusText}
          </p>
        </div>

        <div className="flex items-center gap-1 text-muted-foreground">
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--hazy-amber-dim)]">
            <Icon name="ShieldCheck" size={12} className="text-[var(--hazy-amber)]" />
            <span className="text-[10px] text-[var(--hazy-amber)] font-medium">E2E</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-1.5">
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id} message={msg} delay={i * 20} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 py-3 border-t border-border/30">
        <div className="flex items-end gap-2">
          <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--hazy-surface-hover)] transition-colors text-muted-foreground flex-shrink-0">
            <Icon name="Paperclip" size={18} />
          </button>
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
            disabled={!input.trim()}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--hazy-amber)] text-[#111] hover:opacity-90 transition-opacity disabled:opacity-30 flex-shrink-0"
          >
            <Icon name="ArrowUp" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, delay }: { message: Message; delay: number }) {
  const isMine = message.senderId === "me";

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
          <span className="text-[10px] text-muted-foreground">{message.timestamp}</span>
          {isMine && (
            <Icon
              name={message.isRead ? "CheckCheck" : "Check"}
              size={12}
              className={message.isRead ? "text-[var(--hazy-amber)]" : "text-muted-foreground"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
