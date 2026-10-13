import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FileViewer from "./FileViewer";
import type { PreviewFile } from "./types";

describe("FileViewer", () => {
  it("previews an image, adjusts zoom, and exposes file actions", () => {
    const file: PreviewFile = { path: "/repo/chart.png", name: "chart.png", kind: "image", dataUrl: "data:image/png;base64,iVBORw0KGgo=" };
    const onSave = vi.fn();
    const onOpenExternal = vi.fn();
    const onReveal = vi.fn();
    render(<FileViewer file={file} onSave={onSave} onOpenExternal={onOpenExternal} onReveal={onReveal} />);
    expect(screen.getByRole("img", { name: "chart.png" })).toHaveAttribute("src", file.dataUrl);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Open file" }));
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onOpenExternal).toHaveBeenCalledOnce();
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it("keeps HTML previews sandboxed", () => {
    const file: PreviewFile = { path: "/repo/index.html", name: "index.html", kind: "html", text: "<h1>Hello</h1><script>window.bad=true</script>" };
    render(<FileViewer file={file} onSave={vi.fn()} onOpenExternal={vi.fn()} onReveal={vi.fn()} />);
    const frame = screen.getByTitle("index.html");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcdoc", file.text);
  });
});
