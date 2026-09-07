import type { PawdexEvent, PawdexSession } from "@pawdex/protocol";

const tokenKey = "pawdex-auth-token";

export interface PublicConfig {
  authRequired: boolean;
  vapidPublicKey: string | null;
}

export function getToken(): string {
  return localStorage.getItem(tokenKey) ?? "";
}

export function saveToken(token: string): void {
  if (token) localStorage.setItem(tokenKey, token);
  else localStorage.removeItem(tokenKey);
}

export async function getConfig(): Promise<PublicConfig> {
  return request<PublicConfig>("/api/config", {}, false);
}

export async function listSessions(): Promise<PawdexSession[]> {
  return (await request<{ sessions: PawdexSession[] }>("/api/sessions")).sessions;
}

export async function createSession(input: {
  name?: string;
  cwd: string;
  prompt?: string;
  model?: string;
}): Promise<PawdexSession> {
  return (await request<{ session: PawdexSession }>("/api/sessions", { method: "POST", body: input })).session;
}

export async function sendMessage(sessionId: string, text: string): Promise<PawdexSession> {
  return (await request<{ session: PawdexSession }>(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    body: { text },
  })).session;
}

export async function interruptSession(sessionId: string): Promise<void> {
  await request(`/api/sessions/${sessionId}/interrupt`, { method: "POST" });
}

export async function forkSession(sessionId: string): Promise<PawdexSession> {
  return (await request<{ session: PawdexSession }>(`/api/sessions/${sessionId}/fork`, {
    method: "POST",
    body: {},
  })).session;
}

export function connectEvents(onEvent: (event: PawdexEvent) => void, onState: (online: boolean) => void): () => void {
  let closed = false;
  let socket: WebSocket | undefined;
  let retry: number | undefined;

  const connect = () => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const token = getToken();
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    socket = new WebSocket(`${protocol}//${location.host}/api/events${query}`);
    socket.onopen = () => onState(true);
    socket.onmessage = (message) => onEvent(JSON.parse(String(message.data)) as PawdexEvent);
    socket.onclose = () => {
      onState(false);
      if (!closed) retry = window.setTimeout(connect, 1_500);
    };
  };
  connect();
  return () => {
    closed = true;
    if (retry) window.clearTimeout(retry);
    socket?.close();
  };
}

export async function enablePush(publicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("알림 권한이 허용되지 않았습니다.");
  const registration = await navigator.serviceWorker.register("/sw.js");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBytes(publicKey),
  });
  await request("/api/push/subscribe", { method: "POST", body: subscription.toJSON() });
}

async function request<T>(
  pathname: string,
  options: { method?: string; body?: unknown } = {},
  authenticated = true,
): Promise<T> {
  const token = getToken();
  const response = await fetch(pathname, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(authenticated && token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
  return result;
}

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
