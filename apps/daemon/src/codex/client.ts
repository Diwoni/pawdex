import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import readline from "node:readline";

export interface RpcServerRequest {
  id: number | string;
  method: string;
  params: Record<string, unknown>;
}

export interface RpcNotification {
  method: string;
  params: Record<string, unknown>;
}

interface RpcResponse {
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface CodexClientEvents {
  notification: [message: RpcNotification];
  request: [message: RpcServerRequest];
  stderr: [line: string];
  exit: [error: Error];
}

export class CodexAppServerClient extends EventEmitter<CodexClientEvents> {
  private process?: ChildProcessWithoutNullStreams;
  private requestId = 0;
  private readonly pending = new Map<number | string, PendingCall>();

  constructor(
    readonly binary = resolveCodexBinary(),
    private readonly requestTimeoutMs = 30_000,
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.process) return;

    const child = spawn(this.binary, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.process = child;

    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.handleLine(line));

    const errors = readline.createInterface({ input: child.stderr });
    errors.on("line", (line) => this.emit("stderr", line));

    child.once("error", (error) => this.handleExit(error));
    child.once("exit", (code, signal) => {
      this.handleExit(new Error(`codex app-server exited (code=${String(code)}, signal=${String(signal)})`));
    });

    await this.call("initialize", {
      clientInfo: { name: "pawdex", title: "Pawdex", version: "0.1.0" },
    });
    this.notify("initialized", {});
  }

  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = ++this.requestId;
    const result = new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
    });
    this.write({ id, method, params });
    return result;
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.write({ method, params });
  }

  respond(id: number | string, result: unknown): void {
    this.write({ id, result });
  }

  rejectRequest(id: number | string, code: number, message: string): void {
    this.write({ id, error: { code, message } });
  }

  stop(): void {
    this.process?.kill("SIGTERM");
    this.process = undefined;
  }

  private write(message: unknown): void {
    if (!this.process?.stdin.writable) {
      throw new Error("Codex app-server is not running");
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: RpcResponse | RpcServerRequest | RpcNotification;
    try {
      message = JSON.parse(line) as typeof message;
    } catch {
      this.emit("stderr", `Ignoring non-JSON app-server output: ${line}`);
      return;
    }

    if ("id" in message && !("method" in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${message.error.message} (${message.error.code})`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if ("method" in message && "id" in message) {
      this.emit("request", {
        id: message.id,
        method: message.method,
        params: message.params ?? {},
      });
      return;
    }

    if ("method" in message) {
      this.emit("notification", { method: message.method, params: message.params ?? {} });
    }
  }

  private handleExit(error: Error): void {
    if (!this.process && this.pending.size === 0) return;
    this.process = undefined;
    for (const call of this.pending.values()) {
      clearTimeout(call.timeout);
      call.reject(error);
    }
    this.pending.clear();
    this.emit("exit", error);
  }
}

function resolveCodexBinary(): string {
  if (process.env.PAWDEX_CODEX_BINARY) return process.env.PAWDEX_CODEX_BINARY;
  const pathCli = spawnSync("codex", ["--version"], { stdio: "ignore", timeout: 5_000 });
  if (pathCli.status === 0) return "codex";
  const macAppBinary = "/Applications/ChatGPT.app/Contents/Resources/codex";
  if (process.platform === "darwin" && existsSync(macAppBinary)) return macAppBinary;
  return "codex";
}
