import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { inDesktop, previewFile } from "./api";
import GeneratedImages from "./GeneratedImages";
import { localPath, referencedImagePaths } from "./workspaceFiles";

function InlineImage({ src, alt, cwd, onOpenFile }: { src: string; alt?: string; cwd: string; onOpenFile?: (path: string) => void }) {
  const [data, setData] = useState<string | null>(null);
  useEffect(() => {
    const path = localPath(src);
    if (!inDesktop || !cwd || !path) return;
    let live = true;
    void previewFile(cwd, path).then((file) => { if (live && file.kind === "image") setData(file.dataUrl || null); }).catch(() => {});
    return () => { live = false; };
  }, [src, cwd]);
  const path = localPath(src);
  if (!data || !path) return <span className="image-placeholder">[Image: {alt || src || "attachment"}]</span>;
  return <button type="button" className="inline-image" onClick={() => onOpenFile?.(path)} title={`Open ${path}`}><img src={data} alt={alt || path} /><span>Open larger preview</span></button>;
}

function linkText(text: string, onOpenFile?: (path: string) => void) {
  const pattern = /(?:\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/])[^\s<>()]+?\.(?:png|jpe?g|webp|svg|pdf|html?|txt|md|json|csv|log)(?=$|[\s),.!?;:])/gi;
  const parts: React.ReactNode[] = [];
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > index) parts.push(text.slice(index, start));
    parts.push(<button type="button" className="file-link" key={start} onClick={() => onOpenFile?.(match[0])}>{match[0]}</button>);
    index = start + match[0].length;
  }
  if (index < text.length) parts.push(text.slice(index));
  return parts.length ? parts : text;
}

export default function MarkdownMessage({ text, cwd = "", onOpenFile }: { text: string; cwd?: string; onOpenFile?: (path: string) => void }) {
  return <div className="markdown-message"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a({ href, children }) {
      const path = href && localPath(href);
      if (path) return <button type="button" className="file-link" onClick={() => onOpenFile?.(path)}>{children}</button>;
      if (!href || !/^https?:\/\//i.test(href)) return <span>{children}</span>;
      return <a href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => { if (inDesktop) { event.preventDefault(); void openUrl(href); } }}>{children}</a>;
    },
    img({ alt, src }) { return <InlineImage src={src || ""} alt={alt || undefined} cwd={cwd} onOpenFile={onOpenFile} />; },
    code({ children, className }) {
      const value = String(children).trim();
      const path = !className && localPath(value);
      return path ? <button type="button" className="file-link inline-code" onClick={() => onOpenFile?.(path)}>{children}</button> : <code className={className}>{children}</code>;
    },
    p({ children }) { return <p>{Array.isArray(children) ? children.map((child, index) => typeof child === "string" ? <span key={index}>{linkText(child, onOpenFile)}</span> : child) : typeof children === "string" ? linkText(children, onOpenFile) : children}</p>; },
  }}>{text}</ReactMarkdown><GeneratedImages paths={referencedImagePaths(text)} cwd={cwd} onOpenFile={(path) => onOpenFile?.(path)} /></div>;
}
