import { useEffect, useState } from "react";
import { inDesktop, previewFile } from "./api";
import { isImagePath, localPath } from "./workspaceFiles";

function GeneratedImage({ path, cwd, onOpenFile }: { path: string; cwd: string; onOpenFile: (path: string) => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!inDesktop || !cwd) return;
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = async (attempt: number) => {
      try {
        const file = await previewFile(cwd, path);
        if (live && file.kind === "image") setDataUrl(file.dataUrl || null);
      } catch {
        // A file-change notification may arrive before the writer closes the image.
        if (live && attempt < 2) retry = setTimeout(() => void load(attempt + 1), 750 * (attempt + 1));
      }
    };
    void load(0);
    return () => { live = false; if (retry) clearTimeout(retry); };
  }, [cwd, path]);
  if (!dataUrl) return null;
  const name = path.split(/[\\/]/).at(-1) || path;
  return <button type="button" className="generated-image" onClick={() => onOpenFile(path)} title={`Open ${path}`}>
    <img src={dataUrl} alt={name} /><span>{name}<small>Open larger preview</small></span>
  </button>;
}

export default function GeneratedImages({ paths, cwd, onOpenFile }: { paths: string[]; cwd: string; onOpenFile: (path: string) => void }) {
  const images = [...new Set(paths.map((path) => localPath(path)).filter((path): path is string => Boolean(path && isImagePath(path))))];
  if (!images.length) return null;
  return <div className="generated-images">{images.map((path) => <GeneratedImage key={path} path={path} cwd={cwd} onOpenFile={onOpenFile} />)}</div>;
}
