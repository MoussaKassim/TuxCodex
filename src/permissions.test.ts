import { describe, expect, it } from "vitest";
import { threadPermissionParams, turnPermissionParams } from "./permissions";

describe("permission settings sent to Codex", () => {
  it("uses request approval and workspace sandbox in standard mode", () => {
    expect(threadPermissionParams("standard")).toEqual({ approvalPolicy: "onRequest", sandbox: "workspaceWrite" });
    expect(turnPermissionParams("standard")).toEqual({ approvalPolicy: "onRequest", sandboxPolicy: { type: "workspaceWrite" } });
  });
  it("uses matching full-access settings for new threads and later turns", () => {
    expect(threadPermissionParams("full")).toEqual({ approvalPolicy: "never", sandbox: "dangerFullAccess" });
    expect(turnPermissionParams("full")).toEqual({ approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } });
  });
});
