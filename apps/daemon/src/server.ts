import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyRequest } from "fastify";
import type { PushSubscription } from "web-push";
import type { PawdexEvent } from "@pawdex/protocol";
import { CodexAppServerClient } from "./codex/client.js";
import { NotificationHub } from "./notifications.js";
import { SessionManager, type CreateSessionInput } from "./session-manager.js";
import { SessionStore } from "./store.js";

interface MessageBody { text: string }
interface ForkBody { name?: string; prompt?: string }
interface UnsubscribeBody { endpoint: string }

const host = "127.0.0.1";
const port = Number(process.env.PAWDEX_PORT ?? 8787);
const authToken = process.env.PAWDEX_AUTH_TOKEN;

export async function startServer(): Promise<void> {
  const app = Fastify({ logger: true });
  const store = new SessionStore();
  const codex = new CodexAppServerClient();
  const sessions = new SessionManager(codex, store);
  const notifications = new NotificationHub(store);
  let codexReady = false;
  let codexError: string | undefined;
  codex.on("stderr", (line) => app.log.warn({ source: "codex" }, line));
  codex.on("exit", (error) => {
    codexReady = false;
    codexError = error.message;
  });

  await app.register(websocket);
  app.log.warn("NON-PRODUCTION FEASIBILITY SPIKE: loopback only; approval responses are disabled");

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/") || request.url.startsWith("/api/health") || request.url.startsWith("/api/config")) {
      return;
    }
    if (request.url.startsWith("/api/events")) return;
    if (!authorized(request)) await reply.code(401).send({ error: "Unauthorized" });
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "pawdex",
    version: "0.1.0",
    codex: { ready: codexReady, binary: codex.binary, error: codexError ?? null },
  }));
  app.get("/api/config", async () => ({
    authRequired: Boolean(authToken),
    vapidPublicKey: notifications.publicKey ?? null,
  }));
  app.get("/api/sessions", async () => ({ sessions: sessions.list() }));

  app.post<{ Body: CreateSessionInput }>("/api/sessions", async (request, reply) => {
    try {
      if (!request.body?.cwd) return await reply.code(400).send({ error: "cwd is required" });
      return { session: await sessions.create(request.body) };
    } catch (error) {
      return await reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post<{ Params: { id: string }; Body: MessageBody }>("/api/sessions/:id/messages", async (request, reply) => {
    try {
      return { session: await sessions.send(request.params.id, request.body?.text ?? "") };
    } catch (error) {
      return await reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post<{ Params: { id: string } }>("/api/sessions/:id/interrupt", async (request, reply) => {
    try {
      return { session: await sessions.interrupt(request.params.id) };
    } catch (error) {
      return await reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post<{ Params: { id: string }; Body: ForkBody }>("/api/sessions/:id/fork", async (request, reply) => {
    try {
      return { session: await sessions.fork(request.params.id, request.body?.name, request.body?.prompt) };
    } catch (error) {
      return await reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.post<{ Body: PushSubscription }>("/api/push/subscribe", async (request, reply) => {
    try {
      await notifications.subscribe(request.body);
      return { ok: true };
    } catch (error) {
      return await reply.code(400).send({ error: errorMessage(error) });
    }
  });

  app.delete<{ Body: UnsubscribeBody }>("/api/push/subscribe", async (request) => {
    await notifications.unsubscribe(request.body.endpoint);
    return { ok: true };
  });

  app.get("/api/events", { websocket: true }, (socket, request) => {
    const queryToken = new URL(request.url, "http://localhost").searchParams.get("token");
    if (authToken && !safeTokenMatch(queryToken, authToken)) {
      socket.close(1008, "Unauthorized");
      return;
    }
    socket.send(JSON.stringify({ type: "snapshot", sessions: sessions.list() } satisfies PawdexEvent));
    const listener = (event: PawdexEvent) => socket.send(JSON.stringify(event));
    sessions.on("event", listener);
    socket.on("close", () => sessions.off("event", listener));
  });

  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, wildcard: false });
    app.get("/*", async (_request, reply) => reply.sendFile("index.html"));
  }

  sessions.on("event", (event) => {
    if (event.type === "attention") void notifications.notify(event);
  });

  await notifications.start();
  await app.listen({ host, port });
  try {
    await sessions.start();
    codexReady = true;
  } catch (error) {
    codexError = errorMessage(error);
    app.log.error({ err: error }, "Codex app-server is unavailable; dashboard remains online");
  }
}

function authorized(request: FastifyRequest): boolean {
  if (!authToken) return true;
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") === true && safeTokenMatch(header.slice(7), authToken);
}

function safeTokenMatch(candidate: string | null | undefined, expected: string): boolean {
  if (!candidate || candidate.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntrypoint) {
  startServer().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
