#!/usr/bin/env node
// A small app-server fixture for exercising the packaged desktop through Tauri.
import { appendFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

let thread = null;
let turns = 0;
const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const record = (method, params) => {
  if (process.env.TUXCODEX_E2E_LOG) appendFileSync(process.env.TUXCODEX_E2E_LOG, `${JSON.stringify({ method, params })}\n`);
};

createInterface({ input: process.stdin }).on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (typeof message.id !== "number") return;
  if (message.id === 9001 && message.result) {
    record("approval/response", message.result);
    write({ method: "turn/completed", params: { threadId: "smoke-thread", turn: { id: "smoke-turn", status: "completed" } } });
    return;
  }
  const { id, method, params = {} } = message;
  record(method, params);
  if (method === "initialize") return write({ id, result: {} });
  if (method === "model/list") return write({ id, result: { data: [{ id: "smoke-model", model: "smoke-model", displayName: "Smoke model", isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "low" }], inputModalities: ["text", "image"] }] } });
  if (method === "account/read") return write({ id, result: { account: null, requiresOpenaiAuth: false } });
  if (method === "configRequirements/read") return write({ id, result: { requirements: null } });
  if (method === "thread/list") return write({ id, result: { data: thread ? [thread] : [] } });
  if (method === "thread/start") {
    thread = { id: "smoke-thread", cwd: params.cwd || process.env.TUXCODEX_E2E_WORKSPACE || process.cwd(), name: "System smoke", preview: "System smoke", updatedAt: Date.now() / 1000 };
    return write({ id, result: { thread } });
  }
  if (method === "thread/resume") return write({ id, result: { thread } });
  if (method === "turn/start") {
    const turnId = turns++ === 0 ? "smoke-turn" : `smoke-turn-${turns}`;
    write({ id, result: { turn: { id: turnId, status: "inProgress", items: [], error: null } } });
    if (process.env.TUXCODEX_SMOKE_APPROVAL === "1" && params.approvalPolicy !== "never") {
      write({ id: 9001, method: "item/commandExecution/requestApproval", params: { command: "printf approval-smoke", reason: "Verify the approval decision", cwd: thread.cwd } });
      record("approval/requested", { id: 9001 });
      return;
    }
    setTimeout(() => {
      if (process.env.TUXCODEX_SMOKE_GENERATED_FILE === "1") {
        writeFileSync(`${thread.cwd}/smoke-output.svg`, '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#ff00ff"/></svg>');
        record("fixture/generatedFile", { path: `${thread.cwd}/smoke-output.svg` });
        write({ method: "item/completed", params: { threadId: "smoke-thread", item: { id: "smoke-generated-file", type: "fileChange", status: "completed", changes: [{ path: "smoke-output.svg" }] } } });
      }
      write({ method: "item/agentMessage/delta", params: { threadId: "smoke-thread", itemId: "smoke-reply", delta: "System smoke reply ready." } });
      write({ method: "turn/completed", params: { threadId: "smoke-thread", turn: { id: turnId, status: "completed" } } });
    }, 100);
    return;
  }
  if (method === "thread/read") return write({ id, result: { thread: { ...thread, turns: [] } } });
  write({ id, error: { code: -32601, message: `Unknown method: ${method}` } });
});
