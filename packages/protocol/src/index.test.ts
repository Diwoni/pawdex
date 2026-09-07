import { describe, expect, it } from "vitest";
import { applyCodexNotification, isInputRequest, type PawdexSession } from "./index.js";

const base: PawdexSession = {
  id: "p_1",
  threadId: "thr_1",
  rootSessionId: "thr_1",
  name: "치즈",
  cwd: "/tmp/project",
  status: "idle",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sequence: 0,
};

describe("Codex event projection", () => {
  it("marks a started turn as running", () => {
    const next = applyCodexNotification(base, {
      method: "turn/started",
      params: { turn: { id: "turn_1" } },
    });
    expect(next.status).toBe("running");
    expect(next.activeTurnId).toBe("turn_1");
  });

  it("marks a completed turn as ready for another instruction", () => {
    const next = applyCodexNotification(
      { ...base, status: "running", activeTurnId: "turn_1" },
      { method: "turn/completed", params: { turn: { status: "completed" } } },
    );
    expect(next.status).toBe("completed");
    expect(next.activeTurnId).toBeUndefined();
  });

  it("keeps the failure reason", () => {
    const next = applyCodexNotification(base, {
      method: "turn/completed",
      params: { turn: { status: "failed", error: { message: "No network" } } },
    });
    expect(next.status).toBe("failed");
    expect(next.error).toBe("No network");
  });
});

describe("attention requests", () => {
  it("recognizes approval and question requests", () => {
    expect(isInputRequest("item/commandExecution/requestApproval")).toBe(true);
    expect(isInputRequest("item/tool/requestUserInput")).toBe(true);
    expect(isInputRequest("turn/started")).toBe(false);
  });

  it("clears a request resolved by another client", () => {
    const next = applyCodexNotification(
      {
        ...base,
        status: "needs_input",
        activeTurnId: "turn_1",
        pendingRequest: {
          id: 42,
          method: "item/fileChange/requestApproval",
          title: "승인 필요",
          params: {},
          createdAt: base.createdAt,
        },
      },
      { method: "serverRequest/resolved", params: { requestId: 42 } },
    );
    expect(next.status).toBe("running");
    expect(next.pendingRequest).toBeUndefined();
  });
});
