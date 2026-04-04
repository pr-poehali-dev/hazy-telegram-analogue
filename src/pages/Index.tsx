import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { hasIdentity, getIdentity } from "@/lib/identity";
import { createRoom } from "@/lib/api";
import WelcomeScreen from "@/components/WelcomeScreen";
import HomeScreen from "@/components/HomeScreen";
import type { SavedChat } from "@/components/HomeScreen";
import InviteScreen from "@/components/InviteScreen";
import JoinScreen from "@/components/JoinScreen";
import Conversation from "@/components/Conversation";
import Profile from "@/components/Profile";

type View =
  | "home"
  | "invite"
  | "join"
  | "conversation"
  | "profile";

interface ActiveSession {
  roomCode: string;
  remotePeerId: string;
  remotePeerName: string;
}

function saveChatToList(code: string, peerName: string, peerId: string) {
  try {
    const raw = localStorage.getItem("hazy_chats");
    const chats: SavedChat[] = raw ? JSON.parse(raw) : [];
    if (!chats.some((c) => c.code === code)) {
      chats.unshift({ code, peerName, peerId });
      localStorage.setItem("hazy_chats", JSON.stringify(chats));
    }
  } catch {
    // ignore
  }
}

export default function Index() {
  const { code: urlCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();

  const [identityReady, setIdentityReady] = useState(hasIdentity());
  const [view, setView] = useState<View>(urlCode ? "join" : "home");
  const [roomCode, setRoomCode] = useState(urlCode || "");
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null
  );

  const identity = getIdentity();

  const handleIdentityDone = () => {
    setIdentityReady(true);
    if (urlCode) {
      setView("join");
    }
  };

  const handleNewChat = useCallback(async () => {
    if (!identity) return;
    try {
      const data = await createRoom(identity.peerId, identity.name);
      setRoomCode(data.code);
      setView("invite");
    } catch {
      // handle error
    }
  }, [identity]);

  const handlePaired = useCallback(
    (peerId: string, peerName: string) => {
      saveChatToList(roomCode, peerName, peerId);
      setActiveSession({
        roomCode,
        remotePeerId: peerId,
        remotePeerName: peerName,
      });
      setView("conversation");
    },
    [roomCode]
  );

  const handleJoined = useCallback(
    (remotePeerId: string, remotePeerName: string) => {
      const code = urlCode || roomCode;
      saveChatToList(code, remotePeerName, remotePeerId);
      setActiveSession({
        roomCode: code,
        remotePeerId,
        remotePeerName,
      });
      setView("conversation");
      navigate("/", { replace: true });
    },
    [urlCode, roomCode, navigate]
  );

  const handleOpenChat = useCallback((chat: SavedChat) => {
    setActiveSession({
      roomCode: chat.code,
      remotePeerId: chat.peerId,
      remotePeerName: chat.peerName,
    });
    setView("conversation");
  }, []);

  const goHome = useCallback(() => {
    setView("home");
    setActiveSession(null);
    setRoomCode("");
    navigate("/", { replace: true });
  }, [navigate]);

  // Not yet identified: show welcome
  if (!identityReady) {
    return (
      <Shell>
        <WelcomeScreen onDone={handleIdentityDone} />
      </Shell>
    );
  }

  return (
    <Shell>
      {view === "home" && (
        <HomeScreen
          onNewChat={handleNewChat}
          onOpenChat={handleOpenChat}
          onSettings={() => setView("profile")}
        />
      )}

      {view === "invite" && (
        <InviteScreen
          roomCode={roomCode}
          onPaired={handlePaired}
          onBack={goHome}
        />
      )}

      {view === "join" && (
        <JoinScreen
          code={urlCode || roomCode}
          onJoined={handleJoined}
          onBack={goHome}
        />
      )}

      {view === "conversation" && activeSession && identity && (
        <Conversation
          roomCode={activeSession.roomCode}
          myPeerId={identity.peerId}
          myName={identity.name}
          remotePeerId={activeSession.remotePeerId}
          remotePeerName={activeSession.remotePeerName}
          onBack={goHome}
        />
      )}

      {view === "profile" && <Profile onBack={goHome} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background flex items-center justify-center">
      <div className="w-full h-full max-w-md mx-auto flex flex-col relative md:border-x md:border-border/30">
        {/* Subtle dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--hazy-amber) 0.5px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative z-10 flex flex-col h-full">{children}</div>
      </div>
    </div>
  );
}
