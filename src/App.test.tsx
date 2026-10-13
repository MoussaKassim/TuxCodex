import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
import App from "./App";

describe("TuxCodex preview workflows", () => {
  it("shows project creation fields and keeps desktop creation disabled in preview", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(screen.getByRole("dialog", { name: "New project" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("My project")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  });
  it("saves custom appearance and wallpaper choices", async () => {
    const app = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    fireEvent.click(screen.getByRole("button", { name: "Custom theme" }));
    fireEvent.click(screen.getByRole("button", { name: "Mountains" }));
    expect(screen.getByRole("button", { name: "SummitMountains" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ForestNature" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SummitMountains" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("tuxcodex-settings") || "{}")).toMatchObject({ theme: "custom", wallpaper: "mountains" }));
    expect(document.documentElement.dataset.theme).toBe("custom");
    app.unmount();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByRole("button", { name: "Custom theme" })).toHaveClass("selected");
    expect(screen.getByRole("button", { name: "SummitMountains" })).toHaveClass("selected");
  });
  it("requires an explicit confirmation to enable Full Access", async () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Full Access" }));
    expect(screen.getByRole("alertdialog", { name: "Enable Full Access" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("tuxcodex-settings") || "{}").permissionMode).toBe("standard");
    fireEvent.click(screen.getByRole("button", { name: "Enable Full Access" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Switch to Standard permissions" })).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem("tuxcodex-settings") || "{}").permissionMode).toBe("standard");
  });
});
