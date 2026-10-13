import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ExternalLink, FolderOpen, Minus, Plus } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PreviewFile } from "./types";

function PdfPreview({ file, zoom, onError }: { file: PreviewFile; zoom: number; onError: (error: string) => void }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!file.dataUrl) return;
    let live = true;
    let loading: PDFDocumentLoadingTask | null = null;
    const load = async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const binary = atob(file.dataUrl!.split(",")[1]);
      const data = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      loading = pdfjs.getDocument({ data });
      const loaded = await loading.promise;
      if (live) { setDocument(loaded); setPageNumber(1); }
      else void loading.destroy();
    };
    void load().catch((error) => { if (live) onError(String(error)); });
    return () => { live = false; setDocument(null); if (loading) void loading.destroy(); };
  }, [file.dataUrl, onError]);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let live = true;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    const render = async () => {
      const page = await document.getPage(pageNumber);
      if (!live || !canvas.current) return;
      const viewport = page.getViewport({ scale: zoom });
      const pixelRatio = window.devicePixelRatio || 1;
      const element = canvas.current;
      element.width = Math.floor(viewport.width * pixelRatio);
      element.height = Math.floor(viewport.height * pixelRatio);
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;
      const context = element.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      task = page.render({ canvas: element, canvasContext: context, viewport });
      await task.promise;
    };
    void render().catch((error) => { if (live && !(error instanceof Error && error.name === "RenderingCancelledException")) onError(String(error)); });
    return () => { live = false; task?.cancel(); };
  }, [document, pageNumber, zoom, onError]);
  return <div className="pdf-preview"><div className="pdf-navigation"><button disabled={pageNumber <= 1} onClick={() => setPageNumber((current) => current - 1)}>Previous</button><span>Page {pageNumber} of {document?.numPages || "…"}</span><button disabled={!document || pageNumber >= document.numPages} onClick={() => setPageNumber((current) => current + 1)}>Next</button></div><div className="pdf-canvas"><canvas ref={canvas} /></div></div>;
}

export default function FileViewer({ file, onSave, onOpenExternal, onReveal }: {
  file: PreviewFile;
  onSave: () => void;
  onOpenExternal: () => void;
  onReveal: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setZoom(1); setError(null); }, [file.path]);
  return <section className="file-viewer" aria-label={`Preview ${file.name}`}>
    <div className="file-viewer-toolbar"><div><strong>{file.name}</strong><small title={file.path}>{file.path}</small></div><div className="file-viewer-actions">
      {(file.kind === "image" || file.kind === "pdf") && <><button aria-label="Zoom out" onClick={() => setZoom((current) => Math.max(.25, +(current - .25).toFixed(2)))}><Minus size={14} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setZoom((current) => Math.min(4, +(current + .25).toFixed(2)))}><Plus size={14} /></button></>}
      <button onClick={onSave} title="Save a copy"><ArrowDownToLine size={15} /><span>Save copy</span></button><button onClick={onOpenExternal} title="Open with default app"><ExternalLink size={15} /><span>Open file</span></button><button onClick={onReveal} title="Reveal in file manager"><FolderOpen size={15} /><span>Reveal</span></button>
    </div></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {file.kind === "image" && file.dataUrl && <div className="file-viewer-scroll image-canvas"><img src={file.dataUrl} alt={file.name} style={{ width: `${Math.round(zoom * 100)}%` }} /></div>}
    {file.kind === "pdf" && <PdfPreview file={file} zoom={zoom} onError={setError} />}
    {file.kind === "html" && <div className="file-viewer-scroll html-preview"><p>Static website preview. Scripts are disabled.</p><iframe title={file.name} sandbox="" srcDoc={file.text || ""} /></div>}
    {file.kind === "text" && <pre className="file-viewer-scroll text-preview">{file.text}</pre>}
  </section>;
}
