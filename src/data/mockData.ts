import { Chat, Message, User } from "@/types/chat";

export const currentUser: User = {
  id: "me",
  name: "Ты",
  status: "online",
};

const users: User[] = [
  { id: "u1", name: "Алексей", status: "online" },
  { id: "u2", name: "Марина", status: "recently", lastSeen: "был(а) недавно" },
  { id: "u3", name: "Дмитрий К.", status: "offline", lastSeen: "был 2ч назад" },
  { id: "u4", name: "Команда Hazy", status: "online" },
  { id: "u5", name: "Ольга", status: "offline", lastSeen: "была вчера" },
  { id: "u6", name: "Тех. поддержка", status: "online" },
];

export const contacts: User[] = [
  ...users,
  { id: "u7", name: "Иван П.", status: "offline", lastSeen: "был 3д назад" },
  { id: "u8", name: "Наталья", status: "recently", lastSeen: "была недавно" },
];

export const chats: Chat[] = [
  {
    id: "c1",
    participant: users[0],
    lastMessage: {
      id: "m1", chatId: "c1", senderId: "u1",
      text: "Готово, отправил файлы", timestamp: "14:32",
      isRead: false, isEncrypted: true,
    },
    unreadCount: 3, category: "personal", isPinned: true,
  },
  {
    id: "c2",
    participant: users[1],
    lastMessage: {
      id: "m2", chatId: "c2", senderId: "me",
      text: "Окей, до завтра", timestamp: "13:10",
      isRead: true, isEncrypted: true,
    },
    unreadCount: 0, category: "personal", isPinned: false,
  },
  {
    id: "c3",
    participant: users[2],
    lastMessage: {
      id: "m3", chatId: "c3", senderId: "u3",
      text: "Проверь документ, пожалуйста", timestamp: "12:45",
      isRead: false, isEncrypted: true,
    },
    unreadCount: 1, category: "work", isPinned: false,
  },
  {
    id: "c4",
    participant: users[3],
    lastMessage: {
      id: "m4", chatId: "c4", senderId: "u4",
      text: "Релиз v2.0 выходит на следующей неделе", timestamp: "вчера",
      isRead: true, isEncrypted: true,
    },
    unreadCount: 0, category: "groups", isPinned: true,
  },
  {
    id: "c5",
    participant: users[4],
    lastMessage: {
      id: "m5", chatId: "c5", senderId: "u5",
      text: "Спасибо за помощь!", timestamp: "вчера",
      isRead: true, isEncrypted: true,
    },
    unreadCount: 0, category: "personal", isPinned: false,
  },
  {
    id: "c6",
    participant: users[5],
    lastMessage: {
      id: "m6", chatId: "c6", senderId: "me",
      text: "Всё работает, спасибо", timestamp: "пн",
      isRead: true, isEncrypted: true,
    },
    unreadCount: 0, category: "work", isPinned: false,
  },
];

export const chatMessages: Record<string, Message[]> = {
  c1: [
    { id: "m10", chatId: "c1", senderId: "me", text: "Привет! Как дела с проектом?", timestamp: "14:20", isRead: true, isEncrypted: true },
    { id: "m11", chatId: "c1", senderId: "u1", text: "Привет, почти закончил", timestamp: "14:25", isRead: true, isEncrypted: true },
    { id: "m12", chatId: "c1", senderId: "u1", text: "Осталось пару файлов доделать", timestamp: "14:26", isRead: true, isEncrypted: true },
    { id: "m13", chatId: "c1", senderId: "me", text: "Отлично, жду", timestamp: "14:28", isRead: true, isEncrypted: true },
    { id: "m14", chatId: "c1", senderId: "u1", text: "Готово, отправил файлы", timestamp: "14:32", isRead: false, isEncrypted: true },
  ],
  c2: [
    { id: "m20", chatId: "c2", senderId: "u2", text: "Встретимся завтра в 10?", timestamp: "12:50", isRead: true, isEncrypted: true },
    { id: "m21", chatId: "c2", senderId: "me", text: "Да, конечно", timestamp: "13:00", isRead: true, isEncrypted: true },
    { id: "m22", chatId: "c2", senderId: "u2", text: "Отлично!", timestamp: "13:05", isRead: true, isEncrypted: true },
    { id: "m23", chatId: "c2", senderId: "me", text: "Окей, до завтра", timestamp: "13:10", isRead: true, isEncrypted: true },
  ],
  c3: [
    { id: "m30", chatId: "c3", senderId: "u3", text: "Привет, есть минутка?", timestamp: "12:30", isRead: true, isEncrypted: true },
    { id: "m31", chatId: "c3", senderId: "me", text: "Да, слушаю", timestamp: "12:35", isRead: true, isEncrypted: true },
    { id: "m32", chatId: "c3", senderId: "u3", text: "Проверь документ, пожалуйста", timestamp: "12:45", isRead: false, isEncrypted: true },
  ],
};
