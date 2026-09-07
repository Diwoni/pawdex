import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AttentionEvent } from "@pawdex/protocol";
import webpush, { type PushSubscription } from "web-push";
import type { SessionStore } from "./store.js";

const copy = {
  needs_input: { title: "집사님, 도움이 필요해요! 🐾", verb: "질문을 기다리고 있어요" },
  completed: { title: "다 했어요. 야옹! 😺", verb: "작업을 마쳤어요" },
  failed: { title: "고양이가 곤란해요 🙀", verb: "작업 중 문제가 생겼어요" },
} as const;

export class NotificationHub {
  private subscriptions: PushSubscription[] = [];
  private readonly subscriptionPath: string;
  private readonly pushEnabled: boolean;

  constructor(store: SessionStore) {
    this.subscriptionPath = path.join(store.dataDir, "push-subscriptions.json");
    this.pushEnabled = Boolean(
      process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
    );
    if (this.pushEnabled) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT!,
        process.env.VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!,
      );
    }
  }

  async start(): Promise<void> {
    try {
      this.subscriptions = JSON.parse(await readFile(this.subscriptionPath, "utf8")) as PushSubscription[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  get publicKey(): string | undefined {
    return this.pushEnabled ? process.env.VAPID_PUBLIC_KEY : undefined;
  }

  async subscribe(subscription: PushSubscription): Promise<void> {
    if (!this.pushEnabled) throw new Error("Web Push is not configured");
    if (!subscription.endpoint?.startsWith("https://")) throw new Error("Invalid push endpoint");
    this.subscriptions = [
      ...this.subscriptions.filter((item) => item.endpoint !== subscription.endpoint),
      subscription,
    ];
    await this.save();
  }

  async unsubscribe(endpoint: string): Promise<void> {
    this.subscriptions = this.subscriptions.filter((item) => item.endpoint !== endpoint);
    await this.save();
  }

  async notify(event: AttentionEvent): Promise<void> {
    const message = copy[event.kind];
    const body = `${event.session.name}가 ${message.verb}`;
    notifyMac(message.title, body);

    if (!this.pushEnabled) return;
    const expired = new Set<string>();
    await Promise.allSettled(
      this.subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            subscription,
            JSON.stringify({
              title: message.title,
              body,
              tag: `pawdex-${event.session.id}-${event.kind}`,
              data: { sessionId: event.session.id, url: `/?session=${event.session.id}` },
            }),
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) expired.add(subscription.endpoint);
          else throw error;
        }
      }),
    );
    if (expired.size) {
      this.subscriptions = this.subscriptions.filter((item) => !expired.has(item.endpoint));
      await this.save();
    }
  }

  private async save(): Promise<void> {
    await mkdir(path.dirname(this.subscriptionPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.subscriptionPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.subscriptions, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.subscriptionPath);
  }
}

function notifyMac(title: string, body: string): void {
  if (process.platform !== "darwin" || process.env.PAWDEX_MAC_NOTIFICATIONS === "false") return;
  const script = `display notification "${appleScriptEscape(body)}" with title "${appleScriptEscape(title)}" sound name "Purr"`;
  spawn("osascript", ["-e", script], { stdio: "ignore", detached: true }).unref();

  const customSound = process.env.PAWDEX_SOUND_FILE;
  if (customSound) spawn("afplay", [customSound], { stdio: "ignore", detached: true }).unref();
}

function appleScriptEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').slice(0, 240);
}
