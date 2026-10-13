import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ModelPicker from "./ModelPicker";

describe("ModelPicker", () => {
  it("opens on click, applies a choice, and closes", () => {
    const change = vi.fn();
    render(<ModelPicker label="Model" value="" options={[{ value: "", label: "Default model" }, { value: "alpha", label: "Alpha" }]} onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    expect(screen.getByRole("listbox", { name: "Model" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Alpha" }));
    expect(change).toHaveBeenCalledWith("alpha");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("closes with Escape without changing the setting", () => {
    const change = vi.fn();
    render(<ModelPicker label="Reasoning effort" value="" options={[{ value: "", label: "Default effort" }]} onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Reasoning effort" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });
});
