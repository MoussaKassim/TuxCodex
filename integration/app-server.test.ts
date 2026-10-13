import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compatiblePermissionParams, isPermissionEnumError, threadPermissionParams, turnPermissionParams } from "../src/permissions";

interface Response { id?: number; result?: Record<string, unknown>; error?: { message?: string } }

describe("installed Codex app-server protocol", () => {
  let fixture = "";
  let workspace = "";
  let child: ChildProcessWithoutNullStreams;
  let nextId = 1;
  const pending = new Map<number, { resolve: (response: Response) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  const request = (method: string, params: Record<string, unknown>): Promise<Response> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 10000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  };

  const requestWithPermissions = async (method: string, params: Record<string, unknown>): Promise<Response> => {
    const first = await request(method, params);
    if (!isPermissionEnumError(first.error?.message || "")) return first;
    const compatible = compatiblePermissionParams(params);
    return compatible ? request(method, compatible) : first;
  };

  beforeAll(async () => {
    fixture = await mkdtemp(join(tmpdir(), "tuxcodex-app-server-"));
    workspace = join(fixture, "workspace");
    await mkdir(workspace);
    await mkdir(join(fixture, "codex-home"));
    child = spawn(process.env.TUXCODEX_TEST_CODEX_BIN || "codex", ["app-server", "--listen", "stdio://"], {
      cwd: workspace,
      env: { ...process.env, CODEX_HOME: join(fixture, "codex-home") },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    createInterface({ input: child.stdout }).on("line", (line) => {
      let response: Response;
      try { response = JSON.parse(line) as Response; } catch { return; }
      if (typeof response.id !== "number") return;
      const entry = pending.get(response.id);
      if (!entry) return;
      pending.delete(response.id);
      clearTimeout(entry.timer);
      entry.resolve(response);
    });
    child.once("exit", () => {
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("app-server exited")); }
      pending.clear();
    });
    const initialized = await request("initialize", { clientInfo: { name: "tuxcodex-smoke", title: "TuxCodex protocol test", version: "0.1.0" } });
    if (initialized.error) throw new Error(initialized.error.message || "initialize failed");
    child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
  });

  afterAll(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill();
      await stopped;
    }
    if (fixture) await rm(fixture, { recursive: true, force: true });
  });

  it("lists models and reads administrator requirements", async () => {
    expect((await request("model/list", { limit: 100 })).result?.data).toBeInstanceOf(Array);
    expect((await request("configRequirements/read", {})).result).toHaveProperty("requirements");
  });

  it("starts and resumes Standard and Full Access threads with compatible permissions", async () => {
    const standard = await requestWithPermissions("thread/start", { cwd: workspace, ...threadPermissionParams("standard") });
    expect(standard.error).toBeUndefined();
    const standardId = (standard.result?.thread as { id?: string } | undefined)?.id;
    expect(standardId).toEqual(expect.any(String));
    const resumed = await requestWithPermissions("thread/resume", { threadId: standardId, ...threadPermissionParams("standard") });
    // Older app-server versions persist the rollout only after the first turn.
    expect(resumed.error?.message || "").not.toMatch(/unknown variant|Invalid request/);

    const full = await requestWithPermissions("thread/start", { cwd: workspace, ...threadPermissionParams("full") });
    expect(full.error).toBeUndefined();
    expect((full.result?.thread as { id?: string } | undefined)?.id).toEqual(expect.any(String));
  });

  it("accepts turn permission fields before looking up a nonexistent thread", async () => {
    const response = await requestWithPermissions("turn/start", {
      threadId: "00000000-0000-0000-0000-000000000000",
      input: [{ type: "text", text: "Protocol validation only" }],
      ...turnPermissionParams("standard"),
    });
    expect(response.error?.message).toBeTruthy();
    expect(response.error?.message).not.toMatch(/unknown variant|Invalid request/);
  });

  it("reports audio input schema support for this CLI version", async () => {
    const response = await requestWithPermissions("turn/start", {
      threadId: "00000000-0000-0000-0000-000000000000",
      input: [{ type: "localAudio", path: "/nonexistent/tuxcodex-test.wav" }],
      ...turnPermissionParams("standard"),
    });
    const supported = !response.error?.message?.includes("unknown variant `localAudio`");
    if (process.env.TUXCODEX_EXPECT_AUDIO_SCHEMA === "true") expect(supported).toBe(true);
    if (process.env.TUXCODEX_EXPECT_AUDIO_SCHEMA === "false") expect(supported).toBe(false);
    console.info(`localAudio input schema: ${supported ? "supported" : "unavailable"}`);
  });
});
