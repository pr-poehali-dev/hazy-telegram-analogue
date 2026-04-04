import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Chat } from "@/types/chat";

interface ChatListProps {
  chats: Chat[];
  onSelectChat: (chat: Chat) => void;
  onNewChat: () => void;
  onProfile: () => void;
}

const categories = [
  { key: "all", label: "Все" },
  { key: "personal", label: "Личные" },
  { key: "work", label: "Работа" },
  { key: "groups", label: "Группы" },
] as const;

export default function ChatList({ chats, onSelectChat, onNewChat, onProfile }: ChatListProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filtered = chats.filter((c) => {
    const matchName = c.participant.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === "all" || c.category === activeCategory;
    return matchName && matchCat;
  });

  const pinned = filtered.filter((c) => c.isPinned);
  const regular = filtered.filter((c) => !c.isPinned);

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

      <div className="px-4 pb-2 flex gap-1.5">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              activeCategory === cat.key
                ? "bg-[var(--hazy-amber)] text-[#111]"
                : "bg-[var(--hazy-surface)] text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {pinned.length > 0 && (
          <div className="px-4 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Закреплённые
            </span>
          </div>
        )}
        {pinned.map((chat, i) => (
          <ChatRow key={chat.id} chat={chat} onClick={() => onSelectChat(chat)} delay={i * 30} />
        ))}

        {regular.length > 0 && pinned.length > 0 && (
          <div className="px-4 py-1.5 mt-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Все чаты
            </span>
          </div>
        )}
        {regular.map((chat, i) => (
          <ChatRow key={chat.id} chat={chat} onClick={() => onSelectChat(chat)} delay={(pinned.length + i) * 30} />
        ))}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Icon name="MessageSquare" size={32} className="mb-3 opacity-30" />
            <p className="text-sm">Ничего не найдено</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatRow({ chat, onClick, delay }: { chat: Chat; onClick: () => void; delay: number }) {
  const statusColor =
    chat.participant.status === "online" ? "#4ade80" :
    chat.participant.status === "recently" ? "#d99e6b" : "#555";

  const initials = chat.participant.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

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
          <span className="text-[11px] text-muted-foreground ml-2 flex-shrink-0">
            {chat.lastMessage?.timestamp}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground truncate pr-2">
            {chat.lastMessage?.senderId === "me" && (
              <span className="text-[var(--hazy-amber)] opacity-70 mr-1">Вы:</span>
            )}
            {chat.lastMessage?.text}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {chat.lastMessage?.isEncrypted && (
              <Icon name="Lock" size={10} className="text-[var(--hazy-amber)] opacity-40" />
            )}
            {chat.unreadCount > 0 && (
              <span className="min-w-[18px] h-[18px] rounded-full bg-[var(--hazy-amber)] text-[#111] text-[10px] font-bold flex items-center justify-center px-1">
                {chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
