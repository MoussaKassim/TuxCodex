import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
import { threadItems } from "./api";

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
