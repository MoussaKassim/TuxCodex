import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke }));
import { rpcWithPermissions, threadItems } from "./api";

beforeEach(() => invoke.mockReset());

describe("Codex history conversion", () => {
  it("keeps text, images, audio, and changed file paths in order", () => {
    const items = threadItems({ thread: { turns: [{ items: [
      { id: "u", type: "userMessage", content: [{ type: "text", text: "Inspect" }, { type: "localAudio", path: "/tmp/clip.wav" }, { type: "localImage", path: "/tmp/photo.png" }] },
      { id: "f", type: "fileChange", status: "completed", changes: [{ path: "report.pdf", diff: "+a" }] },
      { id: "a", type: "agentMessage", text: "Done" },
    ] }] } });
    expect(items.map((item) => item.id)).toEqual(["u", "f", "a"]);
    expect(items[0]).toMatchObject({ audioPaths: ["/tmp/clip.wav"], text: "Inspect\n[Audio: clip.wav]\n[Image: photo.png]" });
    expect(items[1]).toMatchObject({ files: ["report.pdf"], detail: "+a" });
  });
});

describe("app-server permission compatibility", () => {
  it("retries thread creation with older enum spellings only after a matching protocol error", async () => {
    invoke.mockRejectedValueOnce("Invalid request: unknown variant `onRequest`").mockResolvedValueOnce({ thread: { id: "thread-1" } });
    await expect(rpcWithPermissions("thread/start", { cwd: "/project", approvalPolicy: "onRequest", sandbox: "workspaceWrite" })).resolves.toMatchObject({ thread: { id: "thread-1" } });
    expect(invoke).toHaveBeenNthCalledWith(1, "rpc", { method: "thread/start", params: { cwd: "/project", approvalPolicy: "onRequest", sandbox: "workspaceWrite" } });
    expect(invoke).toHaveBeenNthCalledWith(2, "rpc", { method: "thread/start", params: { cwd: "/project", approvalPolicy: "on-request", sandbox: "workspace-write" } });
  });

  it("keeps turn-level sandboxPolicy in camel case for older servers", async () => {
    invoke.mockRejectedValueOnce("Invalid request: unknown variant `onRequest`").mockResolvedValueOnce({ turn: { id: "turn-1" } });
    await rpcWithPermissions("turn/start", { threadId: "thread-1", approvalPolicy: "onRequest", sandboxPolicy: { type: "workspaceWrite" }, input: [{ type: "text", text: "Hello" }] });
    expect(invoke).toHaveBeenNthCalledWith(2, "rpc", { method: "turn/start", params: { threadId: "thread-1", approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite" }, input: [{ type: "text", text: "Hello" }] } });
  });

  it("never retries a normal server error or an unsupported audio input", async () => {
    invoke.mockRejectedValueOnce("Model is unavailable.");
    await expect(rpcWithPermissions("turn/start", { approvalPolicy: "onRequest" })).rejects.toBe("Model is unavailable.");
    invoke.mockRejectedValueOnce("Invalid request: unknown variant `localAudio`");
    await expect(rpcWithPermissions("turn/start", { approvalPolicy: "onRequest" })).rejects.toContain("localAudio");
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
