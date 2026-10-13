import { useEffect, useState } from "react";
import { readAudio } from "./api";

export default function AudioClip({ path, url }: { path?: string; url?: string }) {
  const [source, setSource] = useState<string | null>(url || null);
  useEffect(() => {
    if (!path) { setSource(url || null); return; }
    let live = true;
    void readAudio(path).then((value) => { if (live) setSource(value); }).catch(() => { if (live) setSource(null); });
    return () => { live = false; };
  }, [path, url]);
  return <div className="audio-clip"><span>{path ? path.split(/[\\/]/).at(-1) : "Audio message"}</span>{source ? <audio controls preload="none" src={source} /> : <small>Audio preview unavailable</small>}</div>;
}
