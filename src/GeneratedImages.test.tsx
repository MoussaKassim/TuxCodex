import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const preview = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ inDesktop: true, previewFile: preview }));
import GeneratedImages from "./GeneratedImages";

describe("generated image previews", () => {
  it("shows a workspace image and opens its larger viewer", async () => {
    preview.mockResolvedValue({ name: "result.png", path: "/repo/result.png", kind: "image", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
    const open = vi.fn();
    render(<GeneratedImages paths={["/repo/result.png", "/repo/result.png", "/repo/report.pdf"]} cwd="/repo" onOpenFile={open} />);
    expect(await screen.findByRole("img", { name: "result.png" })).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledWith("/repo", "/repo/result.png");
    fireEvent.click(screen.getByRole("button", { name: /result.png/ }));
    expect(open).toHaveBeenCalledWith("/repo/result.png");
  });
});
