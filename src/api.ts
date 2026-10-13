import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ServerMessage } from "./types";

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

export function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}

export function threadItems(raw: unknown): { id: string; role: "user" | "assistant" | "activity"; text: string; status?: string; kind?: string }[] {
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
          .map((part) => (part as { type?: string; text?: string }).type === "text" ? (part as { text?: string }).text || "" : "")
          .filter(Boolean)
          .join("\n");
        if (text) items.push({ id, role: "user", text });
      } else if (item.type === "agentMessage" && typeof item.text === "string") {
        items.push({ id, role: "assistant", text: item.text });
      } else if (item.type === "commandExecution") {
        items.push({ id, role: "activity", kind: "Command", text: String(item.command || "Command"), status: String(item.status || "") });
      } else if (item.type === "fileChange") {
        items.push({ id, role: "activity", kind: "Files", text: "File changes", status: String(item.status || "") });
      }
    }
  }
  return items;
}

export function methodThreadId(message: ServerMessage): string | null {
  const id = message.params?.threadId;
  return typeof id === "string" ? id : null;
}
