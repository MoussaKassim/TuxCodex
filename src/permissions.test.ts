import { describe, expect, it } from "vitest";
import { canEnableFullAccess, compatiblePermissionParams, isPermissionEnumError, threadPermissionParams, turnPermissionParams } from "./permissions";

describe("permission settings sent to Codex", () => {
  it("uses request approval and workspace sandbox in standard mode", () => {
    expect(threadPermissionParams("standard")).toEqual({ approvalPolicy: "onRequest", sandbox: "workspaceWrite" });
    expect(turnPermissionParams("standard")).toEqual({ approvalPolicy: "onRequest", sandboxPolicy: { type: "workspaceWrite" } });
  });
  it("uses matching full-access settings for new threads and later turns", () => {
    expect(threadPermissionParams("full")).toEqual({ approvalPolicy: "never", sandbox: "dangerFullAccess" });
    expect(turnPermissionParams("full")).toEqual({ approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } });
  });
  it("adapts thread enums without changing turn-level sandbox policy", () => {
    expect(compatiblePermissionParams({ ...threadPermissionParams("standard") })).toEqual({ approvalPolicy: "on-request", sandbox: "workspace-write" });
    expect(compatiblePermissionParams({ ...turnPermissionParams("standard") })).toEqual({ approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite" } });
    expect(compatiblePermissionParams({ ...threadPermissionParams("full") })).toEqual({ approvalPolicy: "never", sandbox: "danger-full-access" });
    expect(isPermissionEnumError("Invalid request: unknown variant `onRequest`")).toBe(true);
    expect(isPermissionEnumError("Invalid request: unknown variant `localAudio`")).toBe(false);
  });
  it("honors managed Full Access restrictions in both enum spellings", () => {
    expect(canEnableFullAccess(null)).toBe(true);
    expect(canEnableFullAccess({ allowedApprovalPolicies: ["onRequest", "never"], allowedSandboxModes: ["workspaceWrite", "dangerFullAccess"] })).toBe(true);
    expect(canEnableFullAccess({ allowedApprovalPolicies: ["on-request", "never"], allowedSandboxModes: ["workspace-write", "danger-full-access"] })).toBe(true);
    expect(canEnableFullAccess({ allowedApprovalPolicies: ["on-request"], allowedSandboxModes: ["danger-full-access"] })).toBe(false);
    expect(canEnableFullAccess({ allowedApprovalPolicies: ["never"], allowedSandboxModes: ["workspace-write"] })).toBe(false);
  });
});
