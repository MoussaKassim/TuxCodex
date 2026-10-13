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

export function isPermissionEnumError(message: string): boolean {
  return /unknown variant [`'](?:onRequest|workspaceWrite|dangerFullAccess)[`']/.test(message);
}

export function compatiblePermissionParams(params: Record<string, unknown>): Record<string, unknown> | null {
  const compatible = { ...params };
  if (compatible.approvalPolicy === "onRequest") compatible.approvalPolicy = "on-request";
  if (compatible.sandbox === "workspaceWrite") compatible.sandbox = "workspace-write";
  if (compatible.sandbox === "dangerFullAccess") compatible.sandbox = "danger-full-access";
  return compatible.approvalPolicy === params.approvalPolicy && compatible.sandbox === params.sandbox ? null : compatible;
}
