import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { roomStatus } from "@/lib/api";
import { getIdentity } from "@/lib/identity";

interface InviteScreenProps {
  roomCode: string;
  onPaired: (peerId: string, peerName: string) => void;
  onBack: () => void;
}

export default function InviteScreen({
  roomCode,
  onPaired,
  onBack,
}: InviteScreenProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const inviteLink = `${window.location.origin}/connect/${roomCode}`;

  const checkStatus = useCallback(async () => {
    try {
      const identity = getIdentity();
      if (!identity) return;
      const data = await roomStatus(roomCode, identity.peerId);
      if (data.status === "paired" && data.remote_peer) {
        if (pollRef.current) clearInterval(pollRef.current);
        onPaired(data.remote_peer.peer_id, data.remote_peer.name);
      }
    } catch {
      // room may have expired
    }
  }, [roomCode, onPaired]);

  useEffect(() => {
    pollRef.current = setInterval(checkStatus, 2000);
    // also check immediately
    checkStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkStatus]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Не удалось скопировать");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Hazy - приглашение в чат",
          text: "Присоединяйся к приватному чату в Hazy",
          url: inviteLink,
        });
      } catch {
        // user cancelled share
      }
    }
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
        <h2 className="text-sm font-semibold text-foreground">Новый чат</h2>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-8">
        {/* Spinner */}
        <div className="w-16 h-16 rounded-full border-2 border-[var(--hazy-surface)] border-t-[var(--hazy-amber)] animate-spin mb-6" />

        <h3 className="text-base font-semibold text-foreground mb-1">
          Ожидание подключения...
        </h3>
        <p className="text-xs text-muted-foreground text-center mb-8 max-w-[260px]">
          Отправьте ссылку-приглашение другу. Когда он её откроет, чат начнётся
          автоматически.
        </p>

        {/* Invite link block */}
        <div className="w-full max-w-sm space-y-3">
          <div className="rounded-xl bg-[var(--hazy-surface)] p-3">
            <p className="text-xs text-muted-foreground mb-2">
              Ссылка-приглашение:
            </p>
            <p className="text-xs text-foreground break-all font-mono leading-relaxed">
              {inviteLink}
            </p>
          </div>

          <button
            onClick={handleCopy}
            className="w-full rounded-xl bg-[var(--hazy-amber)] text-[#111] font-semibold text-sm py-3.5 flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
          >
            <Icon name={copied ? "Check" : "Copy"} size={18} />
            {copied ? "Скопировано!" : "Скопировать ссылку"}
          </button>

          {typeof navigator.share === "function" && (
            <button
              onClick={handleShare}
              className="w-full rounded-xl bg-[var(--hazy-surface)] text-foreground font-medium text-sm py-3.5 flex items-center justify-center gap-2 hover:bg-[var(--hazy-surface-hover)] active:bg-[var(--hazy-surface-active)] transition-colors"
            >
              <Icon name="Share2" size={18} />
              Поделиться
            </button>
          )}
        </div>

        {error && (
          <p className="text-xs text-destructive mt-4">{error}</p>
        )}
      </div>
    </div>
  );
}
