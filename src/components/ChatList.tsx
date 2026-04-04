import { useState } from "react";
import Icon from "@/components/ui/icon";

interface ApiChat {
  id: string;
  participant: {
    id: string;
    name: string;
    username: string;
    status: string;
    lastSeen: string | null;
  };
  pendingCount: number;
  createdAt: string;
}

interface ChatListProps {
  chats: ApiChat[];
  loading: boolean;
  onSelectChat: (chat: ApiChat) => void;
  onNewChat: () => void;
  onProfile: () => void;
}

export default function ChatList({ chats, loading, onSelectChat, onNewChat, onProfile }: ChatListProps) {
  const [search, setSearch] = useState("");

  const filtered = chats.filter((c) =>
    c.participant.name.toLowerCase().includes(search.toLowerCase()) ||
    c.participant.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-[var(--hazy-amber)]">hazy</h1>
        <div className="flex gap-1">
          <button
            onClick={onNewChat}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--hazy-surface-hover)] transition-colors"
          >
            <Icon name="SquarePen" size={18} />
          </button>
          <button
            onClick={onProfile}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--hazy-surface-hover)] transition-colors"
          >
            <Icon name="Settings" size={18} />
          </button>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-[var(--hazy-surface)] border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--hazy-amber-dim)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-[var(--hazy-amber)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && filtered.map((chat, i) => (
          <ChatRow key={chat.id} chat={chat} onClick={() => onSelectChat(chat)} delay={i * 30} />
        ))}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Icon name="MessageSquare" size={32} className="mb-3 opacity-30" />
            <p className="text-sm">{chats.length === 0 ? "Нет чатов" : "Ничего не найдено"}</p>
            {chats.length === 0 && (
              <button
                onClick={onNewChat}
                className="mt-3 px-4 py-2 rounded-xl bg-[var(--hazy-amber)] text-[#111] text-xs font-medium"
              >
                Начать чат
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatRow({ chat, onClick, delay }: { chat: { id: string; participant: { name: string; status: string }; pendingCount?: number; createdAt?: string }; onClick: () => void; delay: number }) {
  const statusColor =
    chat.participant.status === "online" ? "#4ade80" : "#555";

  const initials = chat.participant.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const timeStr = (() => {
    try {
      const d = new Date(chat.createdAt || "");
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("ru", { day: "numeric", month: "short" });
    } catch {
      return "";
    }
  })();

  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--hazy-surface-hover)] transition-colors text-left animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full bg-[var(--hazy-surface-active)] flex items-center justify-center text-sm font-semibold text-[var(--hazy-amber)]">
          {initials}
        </div>
        <div
          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background"
          style={{ backgroundColor: statusColor }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium truncate">{chat.participant.name}</span>
          <span className="text-[11px] text-muted-foreground ml-2 flex-shrink-0">{timeStr}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground truncate pr-2">
            <Icon name="Lock" size={10} className="text-[var(--hazy-amber)] opacity-40 inline mr-1" />
            Зашифрованный чат
          </p>
          {(chat.pendingCount || 0) > 0 && (
            <span className="min-w-[18px] h-[18px] rounded-full bg-[var(--hazy-amber)] text-[#111] text-[10px] font-bold flex items-center justify-center px-1">
              {chat.pendingCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}