import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { ServerMessage } from "./types";

const bridge = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: bridge.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
    bridge.listeners.set(name, callback);
    return () => bridge.listeners.delete(name);
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: bridge.open, save: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

import App from "./App";

function emit(name: string, payload: ServerMessage) {
  act(() => bridge.listeners.get(name)?.({ payload }));
}

function requests(method: string) {
  return bridge.invoke.mock.calls
    .filter(([command, args]) => command === "rpc" && args.method === method)
    .map(([, args]) => args.params);
}

beforeEach(() => {
  bridge.listeners.clear();
  bridge.open.mockReset();
  bridge.invoke.mockReset();
  bridge.invoke.mockImplementation(async (command: string, args?: { method?: string }) => {
    if (command !== "rpc") return undefined;
    switch (args?.method) {
      case "model/list": return { data: [{ id: "test-model", model: "test-model", displayName: "Test model", isDefault: true, inputModalities: ["text", "image"], supportedReasoningEfforts: [{ reasoningEffort: "high" }] }] };
      case "account/read": return { account: { email: "tester@example.com" }, requiresOpenaiAuth: true };
      case "thread/list": return { data: [] };
      case "configRequirements/read": return { requirements: null };
      case "thread/start": return { thread: { id: "thread-1" } };
      case "turn/start": return { turn: { id: "turn-1" } };
      default: return {};
    }
  });
});

describe("TuxCodex desktop workflows", () => {
  it("reaches model and reasoning controls from the composer by keyboard", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Codex connected");
    await user.click(screen.getByRole("textbox", { name: "Message to Codex" }));
    for (let index = 0; index < 4; index++) await user.tab();
    expect(screen.getByRole("button", { name: "Model" })).toHaveFocus();
    await user.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("Test model");
    await user.tab();
    expect(screen.getByRole("button", { name: "Reasoning effort" })).toHaveFocus();
    await user.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(screen.getByRole("button", { name: "Reasoning effort" })).toHaveTextContent("high");
  });

  it("sends selected model and effort, streams a reply, and opens a generated image", async () => {
    localStorage.setItem("tuxcodex-settings", JSON.stringify({ cwd: "/workspace/project", theme: "system", permissionMode: "standard" }));
    bridge.invoke.mockImplementation(async (command: string, args?: { method?: string; path?: string }) => {
      if (command === "preview_file") return { path: "/workspace/project/chart.png", name: "chart.png", kind: "image", dataUrl: "data:image/png;base64,iVBORw0KGgo=" };
      if (command !== "rpc") return undefined;
      switch (args?.method) {
        case "model/list": return { data: [{ id: "test-model", model: "test-model", displayName: "Test model", isDefault: true, inputModalities: ["text", "image"], supportedReasoningEfforts: [{ reasoningEffort: "high" }] }] };
        case "account/read": return { account: { email: "tester@example.com" } };
        case "thread/list": return { data: [] };
        case "configRequirements/read": return { requirements: null };
        case "thread/start": return { thread: { id: "thread-1" } };
        case "turn/start": return { turn: { id: "turn-1" } };
        default: return {};
      }
    });

    render(<App />);
    await screen.findByText("Codex connected");
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    fireEvent.click(screen.getByRole("option", { name: "Test model" }));
    fireEvent.click(screen.getByRole("button", { name: "Reasoning effort" }));
    fireEvent.click(screen.getByRole("option", { name: "high" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Codex" }), { target: { value: "Make a chart" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(requests("turn/start")).toHaveLength(1));
    expect(requests("thread/start")[0]).toMatchObject({ cwd: "/workspace/project", model: "test-model", approvalPolicy: "onRequest", sandbox: "workspaceWrite" });
    expect(requests("turn/start")[0]).toMatchObject({ threadId: "thread-1", model: "test-model", effort: "high", input: [{ type: "text", text: "Make a chart" }] });
    emit("codex-event", { method: "item/agentMessage/delta", params: { threadId: "thread-1", itemId: "answer-1", delta: "Done: chart.png" } });
    emit("codex-event", { method: "item/completed", params: { threadId: "thread-1", item: { id: "file-1", type: "fileChange", status: "completed", changes: [{ path: "chart.png" }] } } });
    expect(await screen.findByText("Done: chart.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open file · chart.png" }));
    expect(await screen.findByRole("button", { name: "Close chart.png" })).toBeInTheDocument();
    expect(bridge.invoke).toHaveBeenCalledWith("preview_file", { cwd: "/workspace/project", path: "chart.png" });
    emit("codex-event", { method: "turn/completed", params: { threadId: "thread-1", turn: { status: "completed" } } });
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled());
  });

  it("requires confirmation before a Full Access turn and sends unrestricted permissions", async () => {
    render(<App />);
    await screen.findByText("Codex connected");
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Full Access" }));
    expect(requests("thread/start")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Enable Full Access" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Codex" }), { target: { value: "Inspect this repo" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(requests("turn/start")).toHaveLength(1));
    expect(requests("thread/start")[0]).toMatchObject({ approvalPolicy: "never", sandbox: "dangerFullAccess" });
    expect(requests("turn/start")[0]).toMatchObject({ approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } });
    act(() => bridge.listeners.get("codex-status")?.({ payload: "Codex app-server disconnected." }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("tuxcodex-settings") || "{}").permissionMode).toBe("standard"));
  });

  it("switches permission modes from the composer without bypassing confirmation", async () => {
    render(<App />);
    await screen.findByText("Codex connected");
    fireEvent.click(screen.getByRole("button", { name: "Switch to Full Access" }));
    expect(screen.getByRole("alertdialog", { name: "Enable Full Access" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("tuxcodex-settings") || "{}").permissionMode).toBe("standard");
    fireEvent.click(screen.getByRole("button", { name: "Enable Full Access" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Switch to Standard permissions" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Switch to Standard permissions" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("tuxcodex-settings") || "{}").permissionMode).toBe("standard"));
  });

  it("disables Full Access when administrator requirements forbid it", async () => {
    const base = bridge.invoke.getMockImplementation()!;
    bridge.invoke.mockImplementation(async (command: string, args?: { method?: string }) => {
      if (command === "rpc" && args?.method === "configRequirements/read") return { requirements: { allowedApprovalPolicies: ["on-request"], allowedSandboxModes: ["workspace-write"] } };
      return base(command, args);
    });
    render(<App />);
    await screen.findByText("Codex connected");
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    expect(screen.getByRole("button", { name: "Full Access" })).toBeDisabled();
    expect(screen.getByText("Full Access is disallowed by the Codex administrator's requirements.")).toBeInTheDocument();
  });

  it("falls back to Standard if permission requirements cannot be checked", async () => {
    localStorage.setItem("tuxcodex-settings", JSON.stringify({ permissionMode: "full", theme: "system" }));
    const base = bridge.invoke.getMockImplementation()!;
    bridge.invoke.mockImplementation(async (command: string, args?: { method?: string }) => {
      if (command === "rpc" && args?.method === "configRequirements/read") throw new Error("requirements unavailable");
      return base(command, args);
    });
    render(<App />);
    await screen.findByText("Codex connected");
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    expect(screen.getByRole("button", { name: "Full Access" })).toBeDisabled();
    expect(screen.getByText("Full Access is unavailable because Codex permission requirements could not be checked.")).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("tuxcodex-settings") || "{}").permissionMode).toBe("standard"));
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Codex" }), { target: { value: "Inspect this repo" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(requests("thread/start")[0]).toMatchObject({ approvalPolicy: "onRequest", sandbox: "workspaceWrite" }));
  });

  it("restores an audio attachment and draft when an older server rejects audio", async () => {
    bridge.open.mockResolvedValue("/tmp/voice.wav");
    const base = bridge.invoke.getMockImplementation()!;
    bridge.invoke.mockImplementation(async (command: string, args?: { method?: string }) => {
      if (command === "import_audio") return "/tmp/voice.wav";
      if (command === "rpc" && args?.method === "turn/start") throw "unknown variant `localAudio`";
      return base(command, args);
    });
    render(<App />);
    await screen.findByText("Codex connected");
    fireEvent.click(screen.getByRole("button", { name: "Attach audio" }));
    expect(await screen.findByRole("button", { name: "Remove voice.wav" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Codex" }), { target: { value: "Summarize this clip" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("does not support audio input");
    expect(screen.getByRole("textbox", { name: "Message to Codex" })).toHaveValue("Summarize this clip");
    expect(screen.getByRole("button", { name: "Remove voice.wav" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("creates a project and uses its directory for the next chat", async () => {
    const base = bridge.invoke.getMockImplementation()!;
    bridge.invoke.mockImplementation(async (command: string, args?: { method?: string }) => {
      if (command === "create_project") return { path: "/workspace/new-project", name: "new-project" };
      return base(command, args);
    });
    render(<App />);
    await screen.findByText("Codex connected");
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    fireEvent.change(screen.getByPlaceholderText("My project"), { target: { value: "new-project" } });
    fireEvent.change(screen.getByPlaceholderText("/home/you/projects"), { target: { value: "/workspace" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(bridge.invoke).toHaveBeenCalledWith("create_project", { parent: "/workspace", name: "new-project" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("tuxcodex-settings") || "{}").cwd).toBe("/workspace/new-project"));
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Codex" }), { target: { value: "Inspect this project" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(requests("thread/start")[0]).toMatchObject({ cwd: "/workspace/new-project" }));
  });

  it("shows an approval request and sends the explicit decision", async () => {
    render(<App />);
    await screen.findByText("Codex connected");
    emit("codex-request", { id: 42, method: "item/commandExecution/requestApproval", params: { command: "npm test", cwd: "/workspace/project", reason: "Run the test suite" } });
    expect(screen.getByRole("alertdialog", { name: "Codex approval request" })).toHaveTextContent("npm test");
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(bridge.invoke).toHaveBeenCalledWith("respond_approval", { id: 42, decision: "decline" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: "Codex approval request" })).not.toBeInTheDocument());
  });
});
