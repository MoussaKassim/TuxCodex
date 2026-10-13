import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { inDesktop } from "./api";

export default function MarkdownMessage({ text }: { text: string }) {
  return <div className="markdown-message"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a({ href, children }) {
      if (!href || !/^https?:\/\//i.test(href)) return <span>{children}</span>;
      return <a href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => { if (inDesktop) { event.preventDefault(); void openUrl(href); } }}>{children}</a>;
    },
    img({ alt }) { return <span className="image-placeholder">[Image: {alt || "attachment"}]</span>; },
  }}>{text}</ReactMarkdown></div>;
}
