import { useState, useEffect, useCallback } from "react";
import AuthScreen from "@/components/AuthScreen";
import ChatList from "@/components/ChatList";
import Conversation from "@/components/Conversation";
import NewChat from "@/components/NewChat";
import Profile from "@/components/Profile";
import { isLoggedIn, getStoredUser, getChatList } from "@/lib/api";

type View = "chats" | "conversation" | "newchat" | "profile";

interface ActiveChat {
  id: string;
  participantName: string;
  participantStatus: string;
}

export default function Index() {
  const [authed, setAuthed] = useState(isLoggedIn());
  const [view, setView] = useState<View>("chats");
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [chats, setChats] = useState<any[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);

  const currentUser = getStoredUser();

  const loadChats = useCallback(async () => {
    try {
      const data = await getChatList();
      setChats(data);
    } catch {
      // ignore
    } finally {
      setChatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      loadChats();
      const interval = setInterval(loadChats, 5000);
      return () => clearInterval(interval);
    }
  }, [authed, loadChats]);

  if (!authed) {
    return <AuthScreen onAuth={() => setAuthed(true)} />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSelectChat = (chat: any) => {
    setActiveChat({
      id: chat.id,
      participantName: chat.participant.name,
      participantStatus: chat.participant.status,
    });
    setView("conversation");
  };

  const handleChatCreated = (chatId: string, participant: { id: string; name: string; status: string }) => {
    setActiveChat({
      id: chatId,
      participantName: participant.name,
      participantStatus: participant.status,
    });
    setView("conversation");
    loadChats();
  };

  const goBack = () => {
    setView("chats");
    loadChats();
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-background flex items-center justify-center">
      <div className="w-full h-full max-w-md mx-auto flex flex-col relative md:border-x md:border-border/30">
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, var(--hazy-amber) 0.5px, transparent 0)`,
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative z-10 flex flex-col h-full">
          {view === "chats" && (
            <ChatList
              chats={chats}
              loading={chatsLoading}
              onSelectChat={handleSelectChat}
              onNewChat={() => setView("newchat")}
              onProfile={() => setView("profile")}
            />
          )}
          {view === "conversation" && activeChat && (
            <Conversation
              chatId={activeChat.id}
              participantName={activeChat.participantName}
              participantStatus={activeChat.participantStatus}
              currentUserId={currentUser?.user_id || ""}
              onBack={goBack}
            />
          )}
          {view === "newchat" && (
            <NewChat onBack={goBack} onChatCreated={handleChatCreated} />
          )}
          {view === "profile" && (
            <Profile onBack={goBack} onLogout={() => { setAuthed(false); setView("chats"); }} />
          )}
        </div>
      </div>
    </div>
  );
}