import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { searchUsers, createChat } from "@/lib/api";

interface ApiUser {
  id: string;
  username: string;
  display_name: string;
  status: string;
  last_seen: string | null;
}

interface NewChatProps {
  onBack: () => void;
  onChatCreated: (chatId: string, participant: { id: string; name: string; status: string }) => void;
}

export default function NewChat({ onBack, onChatCreated }: NewChatProps) {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await searchUsers(search || undefined);
        setUsers(result);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const handleStartChat = async (user: ApiUser) => {
    setCreating(user.id);
    try {
      const result = await createChat(user.id);
      onChatCreated(result.chat_id, {
        id: user.id,
        name: user.display_name,
        status: user.status,
      });
    } catch {
      // ignore
    } finally {
      setCreating(null);
    }
  };

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
            placeholder="Найти пользователя..."
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

        {!loading && (
          <div className="px-4 py-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Пользователи · {users.length}
            </span>
          </div>
        )}

        {!loading && users.map((user, i) => {
          const initials = user.display_name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          const statusColor = user.status === "online" ? "#4ade80" : "#555";

          return (
            <button
              key={user.id}
              onClick={() => handleStartChat(user)}
              disabled={creating === user.id}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--hazy-surface-hover)] transition-colors text-left animate-fade-up disabled:opacity-50"
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
                <p className="text-sm font-medium">{user.display_name}</p>
                <p className="text-[11px] text-muted-foreground">@{user.username}</p>
              </div>
              {creating === user.id ? (
                <div className="w-4 h-4 border-2 border-[var(--hazy-amber)] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Icon name="ShieldCheck" size={14} className="text-[var(--hazy-amber)] opacity-40" />
              )}
            </button>
          );
        })}

        {!loading && users.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Icon name="UserSearch" size={32} className="mb-3 opacity-30" />
            <p className="text-sm">Пользователей не найдено</p>
          </div>
        )}
      </div>
    </div>
  );
}
