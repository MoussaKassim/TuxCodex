import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MarkdownMessage from "./MarkdownMessage";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

describe("MarkdownMessage", () => {
  it("opens linked and plain workspace file paths", () => {
    const onOpenFile = vi.fn();
    render(<MarkdownMessage text={"See [the report](./report.pdf) and /repo/output.png."} onOpenFile={onOpenFile} />);
    fireEvent.click(screen.getByRole("button", { name: "the report" }));
    fireEvent.click(screen.getByRole("button", { name: "/repo/output.png" }));
    expect(onOpenFile).toHaveBeenNthCalledWith(1, "./report.pdf");
    expect(onOpenFile).toHaveBeenNthCalledWith(2, "/repo/output.png");
  });

  it("does not treat a web URL as a local file", () => {
    render(<MarkdownMessage text="[website](https://example.com/image.png)" />);
    expect(screen.getByRole("link", { name: "website" })).toHaveAttribute("href", "https://example.com/image.png");
  });
});
