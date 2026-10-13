import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import type { Settings } from "./types";
import { wallpapers } from "./wallpapers";

export default function AppearancePanel({ settings, onChange, onImport, onClose }: {
  settings: Settings;
  onChange: (change: Partial<Settings>) => void;
  onImport: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState("All");
  const categories = ["All", ...new Set(wallpapers.map((wallpaper) => wallpaper.category))];
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="appearance-modal" role="dialog" aria-modal="true" aria-label="Appearance">
      <div className="modal-header"><div><span className="eyebrow">PERSONALIZE</span><h2>Appearance</h2></div><button className="icon-button" onClick={onClose} aria-label="Close appearance"><X size={20} /></button></div>
      <div className="appearance-content">
        <div className="appearance-modes" role="group" aria-label="Appearance mode">
          {(["light", "dark", "custom"] as const).map((mode) => <button key={mode} className={settings.theme === mode ? "selected" : ""} onClick={() => onChange({ theme: mode })}>{mode === "custom" ? "Custom theme" : `${mode[0].toUpperCase()}${mode.slice(1)} mode`}</button>)}
        </div>
        {settings.theme === "custom" && <div className="appearance-colors">
          <label>Background <input type="color" value={settings.backgroundColor || "#0e141b"} onChange={(event) => onChange({ backgroundColor: event.target.value })} /></label>
          <label>Text <input type="color" value={settings.textColor || "#e9eef2"} onChange={(event) => onChange({ textColor: event.target.value })} /></label>
          <label>Accent <input type="color" value={settings.accentColor || "#78e2be"} onChange={(event) => onChange({ accentColor: event.target.value })} /></label>
        </div>}
        <h3>Wallpaper</h3>
        <div className="wallpaper-filters" role="group" aria-label="Wallpaper categories">
          {categories.map((choice) => <button key={choice} type="button" aria-pressed={category === choice} className={category === choice ? "selected" : ""} onClick={() => setCategory(choice)}>{choice}</button>)}
        </div>
        <div className="wallpaper-gallery">
          <button className={`wallpaper-card none ${!settings.wallpaper ? "selected" : ""}`} onClick={() => onChange({ wallpaper: "" })}><span className="wallpaper-thumb">None</span><strong>None</strong></button>
          {wallpapers.filter((wallpaper) => category === "All" || wallpaper.category === category).map((wallpaper) => <button key={wallpaper.id} className={`wallpaper-card ${settings.wallpaper === wallpaper.id ? "selected" : ""}`} onClick={() => onChange({ wallpaper: wallpaper.id })}><span className="wallpaper-thumb" style={{ backgroundImage: `url("${wallpaper.image}")` }} /><strong>{wallpaper.name}</strong><small>{wallpaper.category}</small></button>)}
          <button className={`wallpaper-card ${settings.wallpaper && !wallpapers.some((entry) => entry.id === settings.wallpaper) ? "selected" : ""}`} onClick={onImport}><span className="wallpaper-thumb upload"><ImagePlus size={24} /></span><strong>Import image</strong><small>PNG, JPEG, WebP</small></button>
        </div>
        <div className="wallpaper-adjustments">
          <label>Opacity <output>{Math.round((settings.wallpaperOpacity ?? .24) * 100)}%</output><input type="range" min="0" max="1" step=".01" value={settings.wallpaperOpacity ?? .24} onChange={(event) => onChange({ wallpaperOpacity: Number(event.target.value) })} /></label>
          <label>Blur <output>{settings.wallpaperBlur ?? 0}px</output><input type="range" min="0" max="24" value={settings.wallpaperBlur ?? 0} onChange={(event) => onChange({ wallpaperBlur: Number(event.target.value) })} /></label>
          <label>Brightness <output>{Math.round((settings.wallpaperBrightness ?? 1) * 100)}%</output><input type="range" min=".2" max="1.5" step=".01" value={settings.wallpaperBrightness ?? 1} onChange={(event) => onChange({ wallpaperBrightness: Number(event.target.value) })} /></label>
        </div>
      </div>
      <div className="modal-footer"><button className="primary-button" onClick={onClose}>Done</button></div>
    </section>
  </div>;
}
