export type SessionStatus =
  | "starting"
  | "idle"
  | "running"
  | "needs_input"
  | "completed"
  | "failed"
  | "stopped";

export type AttentionKind = "needs_input" | "completed" | "failed";

export interface PendingRequest {
  id: number | string;
  method: string;
  title: string;
  detail?: string;
  params: Record<string, unknown>;
  createdAt: string;
}

export interface PawdexSession {
  id: string;
  threadId: string;
  rootSessionId: string;
  name: string;
  cwd: string;
  status: SessionStatus;
  model?: string;
  activeTurnId?: string;
  lastMessage?: string;
  error?: string;
  pendingRequest?: PendingRequest;
  createdAt: string;
  updatedAt: string;
  sequence: number;
}

export interface AttentionEvent {
  type: "attention";
  kind: AttentionKind;
  session: PawdexSession;
}

export interface SessionEvent {
  type: "session.updated";
  session: PawdexSession;
}

export interface SnapshotEvent {
  type: "snapshot";
  sessions: PawdexSession[];
}

export type PawdexEvent = AttentionEvent | SessionEvent | SnapshotEvent;

export interface CodexNotification {
  method: string;
  params?: Record<string, unknown>;
}

const inputRequestMethods = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "item/tool/requestUserInput",
  // Older app-server builds used this spelling. Keep it as a compatibility shim.
  "tool/requestUserInput",
  "mcpServer/elicitation/request",
]);

export function isAttentionStatus(status: SessionStatus): status is AttentionKind {
  return status === "needs_input" || status === "completed" || status === "failed";
}

export function isInputRequest(method: string): boolean {
  return inputRequestMethods.has(method);
}

export function requestTitle(method: string): string {
  switch (method) {
    case "item/commandExecution/requestApproval":
      return "명령 실행 허락이 필요해요";
    case "item/fileChange/requestApproval":
      return "파일 변경 허락이 필요해요";
    case "item/permissions/requestApproval":
      return "추가 권한이 필요해요";
    case "item/tool/requestUserInput":
    case "tool/requestUserInput":
      return "집사의 답을 기다리고 있어요";
    case "mcpServer/elicitation/request":
      return "연결된 도구가 입력을 기다려요";
    default:
      return "확인이 필요해요";
  }
}

function nestedString(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;
  for (const part of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function applyCodexNotification(
  current: PawdexSession,
  notification: CodexNotification,
  now = new Date().toISOString(),
): PawdexSession {
  const next: PawdexSession = {
    ...current,
    updatedAt: now,
    sequence: current.sequence + 1,
  };

  if (notification.method === "turn/started") {
    return {
      ...next,
      status: "running",
      activeTurnId: nestedString(notification.params, ["turn", "id"]),
      error: undefined,
      pendingRequest: undefined,
    };
  }

  if (notification.method === "item/agentMessage/delta") {
    const delta = nestedString(notification.params, ["delta"]);
    return delta ? { ...next, lastMessage: `${current.lastMessage ?? ""}${delta}` } : next;
  }

  if (notification.method === "turn/completed") {
    const turnStatus = nestedString(notification.params, ["turn", "status"]);
    const error = nestedString(notification.params, ["turn", "error", "message"]);
    if (turnStatus === "failed") {
      return { ...next, status: "failed", activeTurnId: undefined, error: error ?? "Codex turn failed" };
    }
    if (turnStatus === "interrupted") {
      return { ...next, status: "stopped", activeTurnId: undefined, pendingRequest: undefined };
    }
    return { ...next, status: "completed", activeTurnId: undefined, pendingRequest: undefined };
  }

  if (notification.method === "serverRequest/resolved") {
    const requestId = notification.params?.requestId;
    if (current.pendingRequest && String(current.pendingRequest.id) === String(requestId)) {
      return {
        ...next,
        status: current.activeTurnId ? "running" : "idle",
        pendingRequest: undefined,
      };
    }
  }

  if (notification.method === "error") {
    return {
      ...next,
      status: "failed",
      error: nestedString(notification.params, ["error", "message"]) ?? "Codex app-server error",
    };
  }

  return current;
}
