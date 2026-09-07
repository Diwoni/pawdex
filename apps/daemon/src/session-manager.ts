import { EventEmitter } from "node:events";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  applyCodexNotification,
  isAttentionStatus,
  isInputRequest,
  requestTitle,
  type AttentionEvent,
  type PawdexEvent,
  type PawdexSession,
  type PendingRequest,
} from "@pawdex/protocol";
import { CodexAppServerClient, type RpcNotification, type RpcServerRequest } from "./codex/client.js";
import { SessionStore } from "./store.js";

interface ThreadResult {
  thread: { id: string; sessionId?: string };
}

interface TurnResult {
  turn: { id: string };
}

export interface CreateSessionInput {
  name?: string;
  cwd: string;
  prompt?: string;
  model?: string;
  sandbox?: "read-only" | "workspace-write";
  ephemeral?: boolean;
}

export class SessionManager extends EventEmitter<{ event: [event: PawdexEvent] }> {
  private readonly sessions = new Map<string, PawdexSession>();

  constructor(
    private readonly codex = new CodexAppServerClient(),
    private readonly store = new SessionStore(),
  ) {
    super();
    codex.on("notification", (message) => void this.onNotification(message));
    codex.on("request", (message) => void this.onServerRequest(message));
    codex.on("exit", (error) => void this.onCodexExit(error));
  }

  async start(): Promise<void> {
    const stored = await this.store.load();
    for (const session of stored) this.sessions.set(session.id, session);
    await this.codex.start();

    await Promise.allSettled(
      stored.map(async (session) => {
        try {
          await this.codex.call("thread/resume", { threadId: session.threadId });
          await this.persistAndEmit({ ...session, status: "idle", error: undefined, pendingRequest: undefined });
        } catch (error) {
          await this.persistAndEmit({ ...session, status: "failed", error: errorMessage(error) });
        }
      }),
    );
  }

  list(): PawdexSession[] {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): PawdexSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown Pawdex session: ${id}`);
    return session;
  }

  async create(input: CreateSessionInput): Promise<PawdexSession> {
    const cwd = path.resolve(input.cwd);
    const params: Record<string, unknown> = {
      cwd,
      // The spike deliberately has no approval-response API. Restricted actions
      // fail closed instead of leaving an unsafe generic response bridge open.
      approvalPolicy: "never",
      approvalsReviewer: "user",
      sandbox: input.sandbox ?? "workspace-write",
      serviceName: "pawdex",
      ephemeral: input.ephemeral ?? false,
    };
    if (input.model) params.model = input.model;

    const result = await this.codex.call<ThreadResult>("thread/start", params);
    const now = new Date().toISOString();
    const session: PawdexSession = {
      id: randomUUID(),
      threadId: result.thread.id,
      rootSessionId: result.thread.sessionId ?? result.thread.id,
      name: input.name?.trim() || nextCatName(this.sessions.size),
      cwd,
      status: "idle",
      ...(input.model ? { model: input.model } : {}),
      createdAt: now,
      updatedAt: now,
      sequence: 0,
    };
    this.sessions.set(session.id, session);
    await this.persistAndEmit(session);
    if (input.prompt?.trim()) await this.send(session.id, input.prompt);
    return this.get(session.id);
  }

  async send(id: string, text: string): Promise<PawdexSession> {
    const session = this.get(id);
    if (!text.trim()) throw new Error("Message cannot be empty");

    if (session.status === "running" && session.activeTurnId) {
      await this.codex.call("turn/steer", {
        threadId: session.threadId,
        expectedTurnId: session.activeTurnId,
        input: [{ type: "text", text }],
      });
      return session;
    }

    const result = await this.codex.call<TurnResult>("turn/start", {
      threadId: session.threadId,
      input: [{ type: "text", text }],
    });
    const latest = this.get(id);
    const next = {
      ...latest,
      status: "running" as const,
      activeTurnId: result.turn.id,
      lastMessage: "",
      error: undefined,
      pendingRequest: undefined,
      updatedAt: new Date().toISOString(),
      sequence: latest.sequence + 1,
    };
    await this.persistAndEmit(next);
    return next;
  }

  async interrupt(id: string): Promise<PawdexSession> {
    const session = this.get(id);
    if (!session.activeTurnId) return session;
    await this.codex.call("turn/interrupt", {
      threadId: session.threadId,
      turnId: session.activeTurnId,
    });
    return session;
  }

  async fork(id: string, name?: string, prompt?: string): Promise<PawdexSession> {
    const source = this.get(id);
    const result = await this.codex.call<ThreadResult>("thread/fork", { threadId: source.threadId });
    const now = new Date().toISOString();
    const fork: PawdexSession = {
      ...source,
      id: randomUUID(),
      threadId: result.thread.id,
      rootSessionId: result.thread.sessionId ?? source.rootSessionId,
      name: name?.trim() || `${source.name}의 분신`,
      status: "idle",
      activeTurnId: undefined,
      pendingRequest: undefined,
      error: undefined,
      lastMessage: undefined,
      createdAt: now,
      updatedAt: now,
      sequence: 0,
    };
    this.sessions.set(fork.id, fork);
    await this.persistAndEmit(fork);
    if (prompt?.trim()) await this.send(fork.id, prompt);
    return this.get(fork.id);
  }

  private async onNotification(notification: RpcNotification): Promise<void> {
    const threadId = findThreadId(notification.params);
    if (!threadId) return;
    const session = [...this.sessions.values()].find((item) => item.threadId === threadId);
    if (!session) return;

    const next = applyCodexNotification(session, notification);
    if (next === session) return;
    if (notification.method === "item/agentMessage/delta") {
      this.update(next);
      this.emit("event", { type: "session.updated", session: next });
    } else {
      await this.persistAndEmit(next);
    }
    if (isAttentionStatus(next.status) && next.status !== session.status) {
      this.emit("event", { type: "attention", kind: next.status, session: next } satisfies AttentionEvent);
    }
  }

  private async onServerRequest(request: RpcServerRequest): Promise<void> {
    if (!isInputRequest(request.method)) {
      this.codex.rejectRequest(request.id, -32601, `Unsupported app-server request in Pawdex spike: ${request.method}`);
      return;
    }
    const threadId = findThreadId(request.params);
    if (!threadId) return;
    const session = [...this.sessions.values()].find((item) => item.threadId === threadId);
    if (!session) return;

    const pendingRequest: PendingRequest = {
      id: request.id,
      method: request.method,
      title: requestTitle(request.method),
      detail: requestDetail(request.params),
      params: request.params,
      createdAt: new Date().toISOString(),
    };
    const next: PawdexSession = {
      ...session,
      status: "needs_input",
      pendingRequest,
      updatedAt: pendingRequest.createdAt,
      sequence: session.sequence + 1,
    };
    await this.persistAndEmit(next);
    this.emit("event", { type: "attention", kind: "needs_input", session: next });
  }

  private async onCodexExit(error: Error): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.status === "running" || session.status === "needs_input" || session.status === "starting") {
        const next: PawdexSession = {
          ...session,
          status: "failed",
          error: error.message,
          updatedAt: new Date().toISOString(),
          sequence: session.sequence + 1,
        };
        await this.persistAndEmit(next);
        this.emit("event", { type: "attention", kind: "failed", session: next });
      }
    }
  }

  private update(session: PawdexSession): void {
    this.sessions.set(session.id, session);
  }

  private async persistAndEmit(session: PawdexSession): Promise<void> {
    this.update(session);
    await this.store.save(this.list());
    this.emit("event", { type: "session.updated", session });
  }
}

function findThreadId(params: Record<string, unknown>): string | undefined {
  if (typeof params.threadId === "string") return params.threadId;
  for (const key of ["thread", "turn", "item"]) {
    const value = params[key];
    if (value && typeof value === "object") {
      const threadId = (value as Record<string, unknown>).threadId;
      if (typeof threadId === "string") return threadId;
    }
  }
  return undefined;
}

function requestDetail(params: Record<string, unknown>): string | undefined {
  for (const key of ["reason", "message", "command"]) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) return value.map(String).join(" ");
  }
  return undefined;
}

function nextCatName(index: number): string {
  const names = ["치즈", "보리", "호두", "망고", "두부", "모카", "탄이", "구름"];
  return names[index % names.length] ?? `고양이 ${index + 1}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
