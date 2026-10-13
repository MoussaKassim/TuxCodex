import { describe, expect, it } from "vitest";
import { localPath, referencedImagePaths } from "./workspaceFiles";

describe("workspace file references", () => {
  it("finds generated images in ordinary replies without duplicating embedded Markdown images", () => {
    const text = "Created ./out/chart.png. Open /work/banner.svg, or see [photo](results/photo.webp). ![already shown](./inline.jpg)";
    expect(referencedImagePaths(text)).toEqual(["./out/chart.png", "/work/banner.svg", "results/photo.webp"]);
  });

  it("ignores remote URLs and deduplicates local paths", () => {
    expect(referencedImagePaths("https://example.com/logo.png ./result.png and ./result.png")).toEqual(["./result.png"]);
  });

  it("decodes local file URLs and rejects malformed or remote schemes", () => {
    expect(localPath("file:///work/my%20chart.png")).toBe("/work/my chart.png");
    expect(localPath("file:///work/%ZZ.png")).toBeNull();
    expect(localPath("https://example.com/image.png")).toBeNull();
    expect(localPath("C:\\work\\result.webp")).toBe("C:\\work\\result.webp");
  });
});
