import { useState } from "react";
import Icon from "@/components/ui/icon";
import { getIdentity, updateName } from "@/lib/identity";

interface ProfileProps {
  onBack: () => void;
}

export default function Profile({ onBack }: ProfileProps) {
  const identity = getIdentity();
  const [name, setName] = useState(identity?.name || "");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleSaveName = () => {
    if (!name.trim()) return;
    updateName(name.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCopyId = async () => {
    if (!identity) return;
    try {
      await navigator.clipboard.writeText(identity.peerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    localStorage.clear();
    indexedDB.deleteDatabase("hazy_messages");
    window.location.reload();
  };

  return (
    <div className="flex flex-col h-full animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 shrink-0">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[var(--hazy-surface)] transition-colors"
        >
          <Icon name="ArrowLeft" size={20} />
        </button>
        <h2 className="text-sm font-semibold text-foreground">Настройки</h2>
      </div>

      <div className="flex-1 px-5 space-y-6 overflow-y-auto scrollbar-thin">
        {/* Avatar + Name */}
        <div className="flex flex-col items-center pt-4">
          <div className="w-20 h-20 rounded-full bg-[var(--hazy-surface)] flex items-center justify-center mb-4">
            <span
              className="text-2xl font-bold"
              style={{ color: "var(--hazy-amber)" }}
            >
              {(identity?.name || "A").charAt(0).toUpperCase()}
            </span>
          </div>
        </div>

        {/* Name field */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Ваше имя
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              className="flex-1 rounded-xl bg-[var(--hazy-surface)] border-0 text-sm px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--hazy-amber-dim)]"
            />
            <button
              onClick={handleSaveName}
              disabled={!name.trim()}
              className="rounded-xl bg-[var(--hazy-amber)] text-[#111] font-medium text-sm px-4 py-3 disabled:opacity-40 active:opacity-80 transition-opacity shrink-0"
            >
              {saved ? "Сохранено" : "Сохранить"}
            </button>
          </div>
        </div>

        {/* Peer ID */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Ваш Peer ID
          </label>
          <div
            onClick={handleCopyId}
            className="rounded-xl bg-[var(--hazy-surface)] px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-[var(--hazy-surface-hover)] active:bg-[var(--hazy-surface-active)] transition-colors"
          >
            <p className="text-xs text-muted-foreground font-mono flex-1 truncate">
              {identity?.peerId || "---"}
            </p>
            <Icon
              name={copied ? "Check" : "Copy"}
              size={16}
              className="text-muted-foreground shrink-0"
            />
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-1.5 px-1">
            Уникальный идентификатор, генерируется случайно
          </p>
        </div>

        {/* Danger zone */}
        <div className="pt-4 border-t border-border/30">
          <button
            onClick={handleClearAll}
            className={`w-full rounded-xl text-sm font-medium py-3 transition-colors ${
              confirmClear
                ? "bg-destructive text-destructive-foreground"
                : "bg-[var(--hazy-surface)] text-destructive hover:bg-[var(--hazy-surface-hover)]"
            }`}
          >
            {confirmClear
              ? "Нажмите ещё раз для подтверждения"
              : "Удалить все данные"}
          </button>
          <p className="text-[11px] text-muted-foreground/60 mt-2 px-1 text-center">
            Будут удалены все чаты, сообщения и ваша личность
          </p>
        </div>
      </div>
    </div>
  );
}
