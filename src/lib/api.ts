import urls from "../../backend/func2url.json";

const AUTH_URL = urls.auth;
const CHATS_URL = urls.chats;
const MESSAGES_URL = urls.messages;

function getToken(): string | null {
  return localStorage.getItem("hazy_token");
}

function setToken(token: string) {
  localStorage.setItem("hazy_token", token);
}

function setUser(user: { user_id: string; username: string; display_name: string }) {
  localStorage.setItem("hazy_user", JSON.stringify(user));
}

export function getStoredUser() {
  const raw = localStorage.getItem("hazy_user");
  return raw ? JSON.parse(raw) : null;
}

export function logout() {
  localStorage.removeItem("hazy_token");
  localStorage.removeItem("hazy_user");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

async function request(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка сервера");
  return data;
}

export async function register(username: string, displayName: string, password: string) {
  const data = await request(`${AUTH_URL}?action=register`, {
    method: "POST",
    body: JSON.stringify({ username, display_name: displayName, password, public_key: "" }),
  });
  setToken(data.token);
  setUser(data);
  return data;
}

export async function login(username: string, password: string) {
  const data = await request(`${AUTH_URL}?action=login`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  setUser(data);
  return data;
}

export async function getMe() {
  return request(`${AUTH_URL}?action=me`);
}

export async function searchUsers(search?: string) {
  const q = search ? `&search=${encodeURIComponent(search)}` : "";
  const data = await request(`${AUTH_URL}?action=users${q}`);
  return data.users;
}

export async function getChatList() {
  const data = await request(`${CHATS_URL}?action=list`);
  return data.chats;
}

export async function createChat(participantId: string) {
  return request(`${CHATS_URL}?action=create`, {
    method: "POST",
    body: JSON.stringify({ participant_id: participantId }),
  });
}

export async function getMessages(chatId: string, limit = 50, offset = 0) {
  const data = await request(
    `${MESSAGES_URL}?action=list&chat_id=${chatId}&limit=${limit}&offset=${offset}`
  );
  return data.messages;
}

export async function sendMessage(chatId: string, text: string) {
  return request(`${MESSAGES_URL}?action=send`, {
    method: "POST",
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function markRead(chatId: string) {
  return request(`${MESSAGES_URL}?action=read`, {
    method: "POST",
    body: JSON.stringify({ chat_id: chatId }),
  });
}
