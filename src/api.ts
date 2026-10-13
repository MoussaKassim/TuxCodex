import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ChatItem, CreatedWorktree, GitSnapshot, ServerMessage } from "./types";

export const inDesktop = isTauri();

export async function connect(codexPath: string, restart = false): Promise<void> {
  await invoke("connect", { codexPath: codexPath || null, restart });
}

export async function rpc<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>("rpc", { method, params });
}

export async function respondApproval(id: number, decision: "accept" | "decline"): Promise<void> {
  await invoke("respond_approval", { id, decision });
}

export async function gitSnapshot(cwd: string): Promise<GitSnapshot> {
  return invoke<GitSnapshot>("git_snapshot", { cwd });
}

export async function createWorktree(cwd: string): Promise<CreatedWorktree> {
  return invoke<CreatedWorktree>("create_worktree", { cwd });
}

export function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}

export function threadItems(raw: unknown): ChatItem[] {
  const thread = (raw as { thread?: { turns?: unknown[] } })?.thread;
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  const items: ReturnType<typeof threadItems> = [];
  for (const turn of turns) {
    const entries = (turn as { items?: unknown[] })?.items;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const item = entry as Record<string, unknown>;
      const id = typeof item.id === "string" ? item.id : `history-${items.length}`;
      if (item.type === "userMessage") {
        const content = Array.isArray(item.content) ? item.content : [];
        const text = content
          .map((part) => {
            const input = part as { type?: string; text?: string; path?: string };
            if (input.type === "text") return input.text || "";
            if (input.type === "localImage") return `[Image: ${input.path?.split(/[\\/]/).at(-1) || "attachment"}]`;
            if (input.type === "image") return "[Image attachment]";
            return "";
          })
          .filter(Boolean)
          .join("\n");
        if (text) items.push({ id, role: "user", text });
      } else if (item.type === "agentMessage" && typeof item.text === "string") {
        items.push({ id, role: "assistant", text: item.text });
      } else if (item.type === "commandExecution") {
        items.push({ id, role: "activity", kind: "Command", text: String(item.command || "Command"), status: String(item.status || ""), detail: String(item.aggregatedOutput || "") });
      } else if (item.type === "fileChange") {
        const changes = Array.isArray(item.changes) ? item.changes as { path?: string; diff?: string }[] : [];
        items.push({ id, role: "activity", kind: "Files", text: changes.length === 1 ? changes[0].path || "File changes" : `${changes.length} files changed`, status: String(item.status || ""), detail: changes.map((change) => change.diff || "").filter(Boolean).join("\n") });
      }
    }
  }
  return items;
}

export function methodThreadId(message: ServerMessage): string | null {
  const id = message.params?.threadId;
  return typeof id === "string" ? id : null;
}
