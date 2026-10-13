export interface Thread {
  id: string;
  name?: string | null;
  preview?: string | null;
  cwd?: string | null;
  createdAt?: number;
  updatedAt?: number;
  model?: string | null;
}

export interface Model {
  id: string;
  model?: string;
  displayName?: string;
  isDefault?: boolean;
  hidden?: boolean;
}

export interface ChatItem {
  id: string;
  role: "user" | "assistant" | "activity";
  text: string;
  status?: string;
  kind?: string;
}

export interface ServerMessage {
  method: string;
  params: Record<string, unknown>;
  id?: number;
}

export interface Settings {
  codexPath: string;
  cwd: string;
  model: string;
  theme: "system" | "dark" | "light";
}
