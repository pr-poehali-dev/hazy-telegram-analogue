import { useState } from "react";
import Icon from "@/components/ui/icon";
import { isStandalone, isPushSupported, subscribeToPush } from "@/lib/push";
import { getIdentity } from "@/lib/identity";

interface InstallPromptProps {
  onDismiss: () => void;
}

export default function InstallPrompt({ onDismiss }: InstallPromptProps) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const standalone = isStandalone();
  const pushSupported = isPushSupported();

  const handleEnablePush = async () => {
    setLoading(true);
    const id = getIdentity();
    if (id) {
      const ok = await subscribeToPush(id.peerId);
      setPushEnabled(ok);
    }
    setLoading(false);
  };

  if (standalone && pushEnabled) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center animate-fade-in">
      <div className="w-full max-w-md bg-[var(--hazy-surface)] rounded-t-3xl px-5 pt-6 pb-8 animate-fade-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">Установите Hazy</h3>
          <button
            onClick={onDismiss}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--hazy-surface-hover)] transition-colors"
          >
            <Icon name="X" size={16} />
          </button>
        </div>

        {!standalone && (
          <div className="mb-5">
            <p className="text-sm text-muted-foreground mb-3">
              Для уведомлений добавьте Hazy на домашний экран:
            </p>
            <div className="space-y-2.5">
              <Step num="1" text="Нажмите кнопку «Поделиться»" icon="Share" />
              <Step num="2" text="Выберите «На экран Домой»" icon="Plus" />
              <Step num="3" text="Нажмите «Добавить»" icon="Check" />
            </div>
          </div>
        )}

        {standalone && pushSupported && !pushEnabled && (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground mb-3">
              Включите уведомления, чтобы получать сообщения, когда приложение закрыто.
            </p>
            <button
              onClick={handleEnablePush}
              disabled={loading}
              className="w-full h-11 rounded-xl bg-[var(--hazy-amber)] text-[#111] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Подключение..." : "Включить уведомления"}
            </button>
          </div>
        )}

        {pushEnabled && (
          <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-green-500/10 mb-4">
            <Icon name="BellRing" size={16} className="text-green-400" />
            <span className="text-sm text-green-400">Уведомления включены</span>
          </div>
        )}

        <button
          onClick={onDismiss}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          {standalone ? "Готово" : "Позже"}
        </button>
      </div>
    </div>
  );
}

function Step({ num, text, icon }: { num: string; text: string; icon: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-full bg-[var(--hazy-amber)] text-[#111] text-xs font-bold flex items-center justify-center flex-shrink-0">
        {num}
      </div>
      <span className="text-sm flex-1">{text}</span>
      <Icon name={icon} size={16} className="text-muted-foreground" />
    </div>
  );
}
