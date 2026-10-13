import type { Settings } from "./types";

export function threadPermissionParams(mode: Settings["permissionMode"]): Record<string, string> {
  return mode === "full"
    ? { approvalPolicy: "never", sandbox: "dangerFullAccess" }
    : { approvalPolicy: "onRequest", sandbox: "workspaceWrite" };
}

export function turnPermissionParams(mode: Settings["permissionMode"]): Record<string, unknown> {
  return mode === "full"
    ? { approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } }
    : { approvalPolicy: "onRequest", sandboxPolicy: { type: "workspaceWrite" } };
}
