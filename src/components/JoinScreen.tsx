import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";
import { joinRoom } from "@/lib/api";
import { getIdentity } from "@/lib/identity";
import { initKeyPair } from "@/lib/crypto";

interface JoinScreenProps {
  code: string;
  onJoined: (remotePeerId: string, remotePeerName: string, peerPublicKey?: string) => void;
  onBack: () => void;
}

export default function JoinScreen({ code, onJoined, onBack }: JoinScreenProps) {
  const [status, setStatus] = useState<"joining" | "error">("joining");
  const [errorMsg, setErrorMsg] = useState("");
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    const identity = getIdentity();
    if (!identity) {
      setStatus("error");
      setErrorMsg("Сначала введите имя");
      return;
    }

    initKeyPair().then((keys) => {
      joinRoom(code, identity.peerId, identity.name, keys.publicKey)
        .then((data) => {
          if (data.peer_id && data.peer_name) {
            onJoined(data.peer_id, data.peer_name, data.peer_public_key);
          } else {
            setStatus("error");
            setErrorMsg("Не удалось найти собеседника");
          }
        })
        .catch((err) => {
          setStatus("error");
          setErrorMsg(err?.message || "Комната не найдена или ссылка устарела");
        });
    });
  }, [code, onJoined]);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 animate-fade-up">
      {status === "joining" && (
        <>
          <div className="w-16 h-16 rounded-full border-2 border-[var(--hazy-surface)] border-t-[var(--hazy-amber)] animate-spin mb-6" />
          <h3 className="text-base font-semibold text-foreground mb-1">
            Подключение к чату...
          </h3>
          <p className="text-xs text-muted-foreground text-center">
            Устанавливаем P2P соединение
          </p>
        </>
      )}

      {status === "error" && (
        <>
          <div className="w-16 h-16 rounded-2xl bg-[var(--hazy-surface)] flex items-center justify-center mb-4">
            <Icon name="CircleX" size={28} className="text-destructive" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            Не удалось подключиться
          </h3>
          <p className="text-xs text-muted-foreground text-center mb-6 max-w-[260px]">
            {errorMsg}
          </p>
          <button
            onClick={onBack}
            className="rounded-xl bg-[var(--hazy-surface)] text-foreground font-medium text-sm px-6 py-3 hover:bg-[var(--hazy-surface-hover)] active:bg-[var(--hazy-surface-active)] transition-colors"
          >
            Назад
          </button>
        </>
      )}
    </div>
  );
}
