export interface User {
  id: string;
  name: string;
  avatar?: string;
  status: "online" | "offline" | "recently";
  lastSeen?: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: string;
  isRead: boolean;
  isEncrypted: boolean;
}

export interface Chat {
  id: string;
  participant: User;
  lastMessage?: Message;
  unreadCount: number;
  category: "personal" | "work" | "groups";
  isPinned: boolean;
}

export type View = "chats" | "conversation" | "newchat" | "profile";
