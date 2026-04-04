import { useState } from "react";
import Icon from "@/components/ui/icon";
import { User } from "@/types/chat";
import { contacts } from "@/data/mockData";

interface NewChatProps {
  onBack: () => void;
  onStartChat: (user: User) => void;
}

export default function NewChat({ onBack, onStartChat }: NewChatProps) {
  const [search, setSearch] = useState("");

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border/50">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--hazy-surface-hover)] transition-colors"
        >
          <Icon name="ArrowLeft" size={18} />
        </button>
        <h2 className="text-base font-semibold">Новый чат</h2>
      </div>

      <div className="px-4 py-3">
        <div className="relative">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Найти контакт..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-[var(--hazy-surface)] border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--hazy-amber-dim)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-4 py-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Контакты · {filtered.length}
          </span>
        </div>

        {filtered.map((user, i) => {
          const initials = user.name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          const statusColor =
            user.status === "online" ? "#4ade80" :
            user.status === "recently" ? "#d99e6b" : "#555";

          return (
            <button
              key={user.id}
              onClick={() => onStartChat(user)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--hazy-surface-hover)] transition-colors text-left animate-fade-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-[var(--hazy-surface-active)] flex items-center justify-center text-sm font-semibold text-[var(--hazy-amber)]">
                  {initials}
                </div>
                <div
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
                  style={{ backgroundColor: statusColor }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {user.status === "online" ? "в сети" : user.lastSeen || "не в сети"}
                </p>
              </div>
              <Icon name="ShieldCheck" size={14} className="text-[var(--hazy-amber)] opacity-40" />
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Icon name="UserSearch" size={32} className="mb-3 opacity-30" />
            <p className="text-sm">Контакт не найден</p>
          </div>
        )}
      </div>
    </div>
  );
}
