import { useState } from "react";
import ChatList from "@/components/ChatList";
import Conversation from "@/components/Conversation";
import NewChat from "@/components/NewChat";
import Profile from "@/components/Profile";
import { Chat, View, User } from "@/types/chat";
import { chats as mockChats } from "@/data/mockData";

export default function Index() {
  const [view, setView] = useState<View>("chats");
  const [activeChat, setActiveChat] = useState<Chat | null>(null);

  const handleSelectChat = (chat: Chat) => {
    setActiveChat(chat);
    setView("conversation");
  };

  const handleStartChat = (user: User) => {
    const existing = mockChats.find((c) => c.participant.id === user.id);
    if (existing) {
      handleSelectChat(existing);
    } else {
      const newChat: Chat = {
        id: `c-${Date.now()}`,
        participant: user,
        unreadCount: 0,
        category: "personal",
        isPinned: false,
      };
      handleSelectChat(newChat);
    }
  };

  const goBack = () => setView("chats");

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
              chats={mockChats}
              onSelectChat={handleSelectChat}
              onNewChat={() => setView("newchat")}
              onProfile={() => setView("profile")}
            />
          )}
          {view === "conversation" && activeChat && (
            <Conversation chat={activeChat} onBack={goBack} />
          )}
          {view === "newchat" && (
            <NewChat onBack={goBack} onStartChat={handleStartChat} />
          )}
          {view === "profile" && <Profile onBack={goBack} />}
        </div>
      </div>
    </div>
  );
}
