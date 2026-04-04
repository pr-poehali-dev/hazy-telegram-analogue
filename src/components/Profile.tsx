import { useState } from "react";
import Icon from "@/components/ui/icon";

interface ProfileProps {
  onBack: () => void;
}

export default function Profile({ onBack }: ProfileProps) {
  const [notifications, setNotifications] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border/50">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--hazy-surface-hover)] transition-colors"
        >
          <Icon name="ArrowLeft" size={18} />
        </button>
        <h2 className="text-base font-semibold">Профиль</h2>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="flex flex-col items-center py-8 animate-fade-up">
          <div className="w-20 h-20 rounded-full bg-[var(--hazy-surface-active)] flex items-center justify-center text-2xl font-bold text-[var(--hazy-amber)] mb-4">
            ТЫ
          </div>
          <h3 className="text-lg font-semibold">Мой аккаунт</h3>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Icon name="ShieldCheck" size={12} className="text-[var(--hazy-amber)]" />
            E2E шифрование активно
          </p>
        </div>

        <div className="px-4 space-y-1 animate-fade-up" style={{ animationDelay: "60ms" }}>
          <SectionLabel>Аккаунт</SectionLabel>
          <SettingsRow icon="User" label="Имя" value="Настроить" />
          <SettingsRow icon="AtSign" label="Username" value="@user" />
          <SettingsRow icon="Phone" label="Телефон" value="+7 *** *** **42" />
        </div>

        <div className="px-4 space-y-1 mt-6 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <SectionLabel>Безопасность</SectionLabel>
          <SettingsRow icon="Key" label="Ключ шифрования" value="Активен" accent />
          <SettingsRow icon="Fingerprint" label="Биометрия" value="Выключена" />
          <SettingsRow icon="History" label="Автоудаление" value="Выключено" />
        </div>

        <div className="px-4 space-y-1 mt-6 animate-fade-up" style={{ animationDelay: "180ms" }}>
          <SectionLabel>Настройки</SectionLabel>
          <ToggleRow
            icon="Bell"
            label="Уведомления"
            enabled={notifications}
            onChange={setNotifications}
          />
          <ToggleRow
            icon="CheckCheck"
            label="Отчёты о прочтении"
            enabled={readReceipts}
            onChange={setReadReceipts}
          />
          <SettingsRow icon="Moon" label="Тема" value="Тёмная" />
          <SettingsRow icon="Globe" label="Язык" value="Русский" />
        </div>

        <div className="px-4 mt-8 mb-8 animate-fade-up" style={{ animationDelay: "240ms" }}>
          <button className="w-full py-3 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors">
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {children}
      </span>
    </div>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <button className="w-full flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-[var(--hazy-surface-hover)] transition-colors text-left">
      <div className="w-8 h-8 rounded-lg bg-[var(--hazy-surface)] flex items-center justify-center">
        <Icon name={icon} size={16} className={accent ? "text-[var(--hazy-amber)]" : "text-muted-foreground"} />
      </div>
      <span className="flex-1 text-sm">{label}</span>
      <span className={`text-xs ${accent ? "text-[var(--hazy-amber)]" : "text-muted-foreground"}`}>
        {value}
      </span>
      <Icon name="ChevronRight" size={14} className="text-muted-foreground opacity-50" />
    </button>
  );
}

function ToggleRow({
  icon,
  label,
  enabled,
  onChange,
}: {
  icon: string;
  label: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className="w-full flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-[var(--hazy-surface-hover)] transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-lg bg-[var(--hazy-surface)] flex items-center justify-center">
        <Icon name={icon} size={16} className="text-muted-foreground" />
      </div>
      <span className="flex-1 text-sm">{label}</span>
      <div
        className={`w-10 h-6 rounded-full transition-colors relative ${
          enabled ? "bg-[var(--hazy-amber)]" : "bg-[var(--hazy-surface-active)]"
        }`}
      >
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </div>
    </button>
  );
}
