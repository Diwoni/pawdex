#!/usr/bin/env node
import { startServer } from "./server.js";

const [command = "help", ...args] = process.argv.slice(2);
const baseUrl = process.env.PAWDEX_URL ?? "http://127.0.0.1:8787";
const token = process.env.PAWDEX_AUTH_TOKEN;

async function main(): Promise<void> {
  switch (command) {
    case "daemon":
      await startServer();
      return;
    case "list": {
      const result = await api<{ sessions: Array<{ id: string; name: string; status: string; cwd: string }> }>("/api/sessions");
      for (const session of result.sessions) {
        console.log(`${session.id}\t${session.status}\t${session.name}\t${session.cwd}`);
      }
      return;
    }
    case "start": {
      const cwd = option(args, "--cwd") ?? process.cwd();
      const body = {
        cwd,
        name: option(args, "--name"),
        prompt: option(args, "--prompt"),
        model: option(args, "--model"),
      };
      console.log(JSON.stringify(await api("/api/sessions", { method: "POST", body }), null, 2));
      return;
    }
    case "send": {
      const [id, ...words] = args;
      if (!id || words.length === 0) throw new Error("Usage: pawdex send <session-id> <message>");
      console.log(JSON.stringify(await api(`/api/sessions/${id}/messages`, { method: "POST", body: { text: words.join(" ") } }), null, 2));
      return;
    }
    case "fork": {
      const [id] = args;
      if (!id) throw new Error("Usage: pawdex fork <session-id> [--name name] [--prompt text]");
      console.log(JSON.stringify(await api(`/api/sessions/${id}/fork`, {
        method: "POST",
        body: { name: option(args, "--name"), prompt: option(args, "--prompt") },
      }), null, 2));
      return;
    }
    case "stop": {
      const [id] = args;
      if (!id) throw new Error("Usage: pawdex stop <session-id>");
      console.log(JSON.stringify(await api(`/api/sessions/${id}/interrupt`, { method: "POST" }), null, 2));
      return;
    }
    default:
      console.log(`Pawdex — herd parallel Codex cats\n\nCommands:\n  pawdex daemon\n  pawdex list\n  pawdex start [--cwd path] [--name cat] [--prompt task] [--model id]\n  pawdex send <session-id> <message>\n  pawdex fork <session-id> [--name cat] [--prompt task]\n  pawdex stop <session-id>`);
  }
}

async function api<T = unknown>(pathname: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
  return result;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
