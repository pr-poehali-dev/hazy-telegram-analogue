import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { getChatsWithLastMessage, getUnreadCounts, type LocalMessage } from "@/lib/messageStore";
import { isEncryptedPayload } from "@/lib/crypto";

export interface SavedChat {
  code: string;
  peerName: string;
  peerId: string;
}

function getSavedChats(): SavedChat[] {
  try {
    const raw = localStorage.getItem("hazy_chats");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function previewText(msg: LocalMessage): string {
  if (isEncryptedPayload(msg.text)) return "Зашифрованное сообщение";
  return msg.text;
}

interface HomeScreenProps {
  myPeerId: string;
  onNewChat: () => void;
  onOpenChat: (chat: SavedChat) => void;
  onSettings: () => void;
}

export default function HomeScreen({
  myPeerId,
  onNewChat,
  onOpenChat,
  onSettings,
}: HomeScreenProps) {
  const [chats, setChats] = useState<SavedChat[]>([]);
  const [lastMessages, setLastMessages] = useState<
    Record<string, LocalMessage>
  >({});
  const [unread, setUnread] = useState<Record<string, number>>({});

  useEffect(() => {
    setChats(getSavedChats());
    getChatsWithLastMessage().then(setLastMessages).catch(() => {});
    if (myPeerId) {
      getUnreadCounts(myPeerId).then(setUnread).catch(() => {});
    }
  }, [myPeerId]);

  return (
    <div className="flex flex-col h-full animate-fade-up">
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <h1
          className="text-xl font-bold tracking-tight"
          style={{ color: "var(--hazy-amber)" }}
        >
          hazy
        </h1>
        <button
          onClick={onSettings}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[var(--hazy-surface)] transition-colors"
        >
          <Icon name="Settings" size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-3">
        {chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 -mt-12">
            <div className="w-16 h-16 rounded-2xl bg-[var(--hazy-surface)] flex items-center justify-center mb-4">
              <Icon
                name="MessagesSquare"
                size={28}
                className="text-muted-foreground"
              />
            </div>
            <p className="text-sm text-muted-foreground mb-1 font-medium">
              Пока нет чатов
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-[220px]">
              Создайте новый чат и отправьте ссылку-приглашение другу
            </p>
          </div>
        ) : (
          <div className="space-y-1 pb-24">
            {chats.map((chat) => {
              const last = lastMessages[chat.code];
              const count = unread[chat.code] || 0;
              return (
                <button
                  key={chat.code}
                  onClick={() => onOpenChat(chat)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[var(--hazy-surface-hover)] active:bg-[var(--hazy-surface-active)] transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--hazy-surface)] flex items-center justify-center shrink-0">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--hazy-amber)" }}
                    >
                      {chat.peerName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground truncate">
                        {chat.peerName}
                      </span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {last && (
                          <span className="text-[11px] text-muted-foreground">
                            {formatTime(last.timestamp)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">
                        {last ? previewText(last) : "Нет сообщений"}
                      </p>
                      {count > 0 && (
                        <span className="shrink-0 ml-2 min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--hazy-amber)] text-[#111] text-[11px] font-semibold flex items-center justify-center">
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="absolute bottom-6 right-6">
        <button
          onClick={onNewChat}
          className="w-14 h-14 rounded-2xl bg-[var(--hazy-amber)] text-[#111] flex items-center justify-center shadow-lg shadow-[var(--hazy-amber-dim)] active:scale-95 transition-transform"
        >
          <Icon name="Plus" size={24} />
        </button>
      </div>
    </div>
  );
}
