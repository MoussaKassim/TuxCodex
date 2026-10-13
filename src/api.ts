import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ChatItem, CreatedWorktree, GitSnapshot, PreviewFile, ServerMessage } from "./types";
import { compatiblePermissionParams, isPermissionEnumError } from "./permissions";

export const inDesktop = isTauri();

export async function connect(codexPath: string, restart = false): Promise<void> {
  await invoke("connect", { codexPath: codexPath || null, restart });
}

export async function rpc<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>("rpc", { method, params });
}

// App-server releases differ in how thread-level permissions are serialized.
// Retry only when the server explicitly rejects one of our enum spellings.
export async function rpcWithPermissions<T = unknown>(method: "thread/start" | "thread/resume" | "turn/start", params: Record<string, unknown>): Promise<T> {
  try {
    return await rpc<T>(method, params);
  } catch (error) {
    if (!isPermissionEnumError(errorText(error))) throw error;
    const compatible = compatiblePermissionParams(params);
    if (!compatible) throw error;
    return rpc<T>(method, compatible);
  }
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

export async function createProject(parent: string, name: string): Promise<{ path: string; name: string }> {
  return invoke("create_project", { parent, name });
}

export async function importWallpaper(source: string): Promise<[string, string]> {
  return invoke("import_wallpaper", { source });
}

export async function readWallpaper(path: string): Promise<string> {
  return invoke("read_wallpaper", { path });
}

export async function previewFile(cwd: string, path: string): Promise<PreviewFile> {
  return invoke("preview_file", { cwd, path });
}

export async function openWorkspaceFile(cwd: string, path: string, reveal: boolean): Promise<void> {
  await invoke("open_workspace_file", { cwd, path, reveal });
}

export async function copyWorkspaceFile(cwd: string, path: string, destination: string): Promise<void> {
  await invoke("copy_workspace_file", { cwd, path, destination });
}

export async function importAudio(source: string): Promise<string> {
  return invoke("import_audio", { source });
}

export async function saveRecording(dataUrl: string): Promise<string> {
  return invoke("save_recording", { dataUrl });
}

export async function readAudio(path: string): Promise<string> {
  return invoke("read_audio", { path });
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
            if (input.type === "localAudio") return `[Audio: ${input.path?.split(/[\\/]/).at(-1) || "clip"}]`;
            if (input.type === "audio") return "[Audio attachment]";
            return "";
          })
          .filter(Boolean)
          .join("\n");
        const audioPaths = content.map((part) => part as { type?: string; path?: string }).filter((part) => part.type === "localAudio" && typeof part.path === "string").map((part) => part.path!);
        const audioUrls = content.map((part) => part as { type?: string; url?: string }).filter((part) => part.type === "audio" && typeof part.url === "string" && part.url.startsWith("data:audio/")).map((part) => part.url!);
        if (text || audioPaths.length || audioUrls.length) items.push({ id, role: "user", text, audioPaths, audioUrls });
      } else if (item.type === "agentMessage" && typeof item.text === "string") {
        items.push({ id, role: "assistant", text: item.text });
      } else if (item.type === "commandExecution") {
        items.push({ id, role: "activity", kind: "Command", text: String(item.command || "Command"), status: String(item.status || ""), detail: String(item.aggregatedOutput || "") });
      } else if (item.type === "fileChange") {
        const changes = Array.isArray(item.changes) ? item.changes as { path?: string; diff?: string }[] : [];
        items.push({ id, role: "activity", kind: "Files", text: changes.length === 1 ? changes[0].path || "File changes" : `${changes.length} files changed`, status: String(item.status || ""), detail: changes.map((change) => change.diff || "").filter(Boolean).join("\n"), files: changes.map((change) => change.path).filter((path): path is string => Boolean(path)) });
      }
    }
  }
  return items;
}

export function methodThreadId(message: ServerMessage): string | null {
  const id = message.params?.threadId;
  return typeof id === "string" ? id : null;
}
