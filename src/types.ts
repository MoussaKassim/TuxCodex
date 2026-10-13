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
  defaultReasoningEffort?: string;
  supportedReasoningEfforts?: { reasoningEffort: string; description?: string }[];
  inputModalities?: string[];
}

export interface PlanStep {
  step: string;
  status: "pending" | "inProgress" | "completed";
}

export interface GitFile {
  path: string;
  status: string;
}

export interface GitSnapshot {
  root: string;
  branch: string;
  isWorktree: boolean;
  files: GitFile[];
  diff: string;
  truncated: boolean;
}

export interface CreatedWorktree {
  path: string;
  sourceRoot: string;
}

export interface ChatItem {
  id: string;
  role: "user" | "assistant" | "activity";
  text: string;
  status?: string;
  kind?: string;
  detail?: string;
  files?: string[];
  audioPaths?: string[];
  audioUrls?: string[];
}

export interface PreviewFile {
  path: string;
  name: string;
  kind: "image" | "pdf" | "html" | "text";
  dataUrl?: string;
  text?: string;
  workspace?: string;
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
  effort: string;
  permissionMode?: "standard" | "full";
  theme: "system" | "dark" | "light" | "custom";
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  wallpaper?: string;
  wallpaperOpacity?: number;
  wallpaperBlur?: number;
  wallpaperBrightness?: number;
}
