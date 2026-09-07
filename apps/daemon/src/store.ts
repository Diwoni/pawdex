import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { PawdexSession } from "@pawdex/protocol";

interface StoredState {
  version: 1;
  sessions: PawdexSession[];
}

export class SessionStore {
  readonly dataDir: string;
  readonly statePath: string;
  private writeQueue = Promise.resolve();

  constructor(dataDir = process.env.PAWDEX_DATA_DIR ?? path.join(homedir(), ".pawdex")) {
    this.dataDir = dataDir;
    this.statePath = path.join(dataDir, "state.json");
  }

  async load(): Promise<PawdexSession[]> {
    try {
      const contents = await readFile(this.statePath, "utf8");
      const state = JSON.parse(contents) as StoredState;
      return state.version === 1 && Array.isArray(state.sessions) ? state.sessions : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  save(sessions: PawdexSession[]): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
      const temporaryPath = `${this.statePath}.tmp`;
      const body = JSON.stringify({ version: 1, sessions } satisfies StoredState, null, 2);
      await writeFile(temporaryPath, `${body}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, this.statePath);
    });
    return this.writeQueue;
  }
}
