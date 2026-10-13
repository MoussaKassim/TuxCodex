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
}

export interface PlanStep {
  step: string;
  status: "pending" | "inProgress" | "completed";
}

export interface ChatItem {
  id: string;
  role: "user" | "assistant" | "activity";
  text: string;
  status?: string;
  kind?: string;
  detail?: string;
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
  theme: "system" | "dark" | "light";
}
