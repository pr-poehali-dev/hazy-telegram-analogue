import { useState } from "react";
import { createIdentity } from "@/lib/identity";
import Icon from "@/components/ui/icon";

interface WelcomeScreenProps {
  onDone: () => void;
}

export default function WelcomeScreen({ onDone }: WelcomeScreenProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleStart = () => {
    if (!name.trim()) return;
    setLoading(true);
    createIdentity(name.trim());
    setTimeout(() => onDone(), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleStart();
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 animate-fade-up">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-2xl bg-[var(--hazy-amber)] flex items-center justify-center">
          <Icon name="MessageCircle" size={24} className="text-[#111]" />
        </div>
      </div>

      <h1
        className="text-3xl font-bold tracking-tight mb-1"
        style={{ color: "var(--hazy-amber)" }}
      >
        hazy
      </h1>

      <p className="text-sm text-muted-foreground mb-10 text-center">
        Анонимный P2P мессенджер
      </p>

      <div className="w-full max-w-xs space-y-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Как вас называть?
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите имя"
            maxLength={32}
            autoFocus
            className="w-full rounded-xl bg-[var(--hazy-surface)] border-0 text-sm px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--hazy-amber-dim)]"
          />
        </div>

        <button
          onClick={handleStart}
          disabled={!name.trim() || loading}
          className="w-full rounded-xl bg-[var(--hazy-amber)] text-[#111] font-semibold text-sm py-3 transition-opacity disabled:opacity-40 active:opacity-80"
        >
          {loading ? "Загрузка..." : "Начать"}
        </button>
      </div>

      <div className="mt-12 flex items-center gap-2 text-xs text-muted-foreground">
        <Icon name="ShieldCheck" size={14} />
        <span>Без аккаунтов. Без паролей. Полная анонимность.</span>
      </div>
    </div>
  );
}
