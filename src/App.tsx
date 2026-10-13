import { useCallback, useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Command,
  FolderOpen,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { connect, errorText, inDesktop, methodThreadId, respondApproval, rpc, threadItems } from "./api";
import type { ChatItem, Model, ServerMessage, Settings, Thread } from "./types";

const defaultSettings: Settings = { codexPath: "", cwd: "", model: "", theme: "system" };
const demoThreads: Thread[] = [
  { id: "demo-1", name: "Welcome to TuxCodex", preview: "Explore the Linux desktop client", updatedAt: Date.now() / 1000 },
  { id: "demo-2", name: "A sample workspace", preview: "Ask Codex about your project", updatedAt: Date.now() / 1000 - 86400 },
];
const demoItems: ChatItem[] = [
  { id: "demo-u", role: "user", text: "What can I do here?" },
  { id: "demo-a", role: "assistant", text: "Connect the Codex CLI to chat about a project, review code, and watch work stream in real time. Your chats are stored by Codex on this machine. This preview runs without a Codex connection." },
];

function readSettings(): Settings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem("tuxcodex-settings") || "{}") };
  } catch {
    return defaultSettings;
  }
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function displayName(thread: Thread): string {
  return thread.name?.trim() || thread.preview?.trim() || "New chat";
}

function shortPath(path: string): string {
  if (!path) return "No workspace selected";
  const parts = path.replace(/\/$/, "").split("/");
  return parts.at(-1) || path;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [draftSettings, setDraftSettings] = useState<Settings>(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "connected" | "disconnected" | "demo">(inDesktop ? "connecting" : "demo");
  const [connectionDetail, setConnectionDetail] = useState(inDesktop ? "Starting Codex app-server…" : "Browser preview");
  const [account, setAccount] = useState<string | null>(null);
  const [authMissing, setAuthMissing] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [threads, setThreads] = useState<Thread[]>(inDesktop ? [] : demoThreads);
  const [selectedId, setSelectedId] = useState<string | null>(inDesktop ? null : "demo-1");
  const [items, setItems] = useState<ChatItem[]>(inDesktop ? [] : demoItems);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [approvalQueue, setApprovalQueue] = useState<ServerMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedRef = useRef<string | null>(selectedId);
  const turnRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    localStorage.setItem("tuxcodex-settings", JSON.stringify(settings));
    document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, busy, selectedId]);

  const refreshThreads = useCallback(async () => {
    if (!inDesktop) return;
    const result = await rpc<{ data?: Thread[] }>("thread/list", {
      limit: 100,
      sortKey: "updated_at",
      sourceKinds: ["appServer", "cli", "vscode"],
    });
    setThreads(Array.isArray(result.data) ? result.data : []);
  }, []);

  const loadServer = useCallback(async (path: string, restart = false) => {
    setConnection("connecting");
    setConnectionDetail("Starting Codex app-server…");
    try {
      await connect(path, restart);
      selectedRef.current = null;
      turnRef.current = null;
      setSelectedId(null);
      setItems([]);
      setBusy(false);
      setConnection("connected");
      setConnectionDetail("Connected to Codex app-server");
      const results = await Promise.allSettled([
        rpc<{ data?: Model[] }>("model/list", { limit: 100 }),
        rpc<{ account?: { type?: string; email?: string | null } | null; requiresOpenaiAuth?: boolean }>("account/read", { refreshToken: false }),
        refreshThreads(),
      ]);
      if (results[0].status === "fulfilled") {
        const available = results[0].value.data || [];
        setModels(available.filter((model) => !model.hidden));
      }
      if (results[1].status === "fulfilled") {
        const info = results[1].value.account;
        setAccount(info?.email || info?.type || null);
        setAuthMissing(Boolean(results[1].value.requiresOpenaiAuth && !info));
      }
      for (const result of results) {
        if (result.status === "rejected") setError(errorText(result.reason));
      }
    } catch (failure) {
      setConnection("demo");
      setConnectionDetail(errorText(failure));
      setAuthMissing(false);
      selectedRef.current = "demo-1";
      setSelectedId("demo-1");
      setThreads(demoThreads);
      setItems(demoItems);
    }
  }, [refreshThreads]);

  useEffect(() => {
    if (!inDesktop) return;
    let unlisteners: UnlistenFn[] = [];
    let disposed = false;
    const start = async () => {
      const subscriptions = await Promise.all([
        listen<ServerMessage>("codex-event", (event) => {
          const message = event.payload;
          const threadId = methodThreadId(message);
          if (message.method === "turn/completed") {
            if (!threadId || threadId === selectedRef.current) {
              setBusy(false);
              turnRef.current = null;
              const turn = message.params.turn as { status?: string; error?: { message?: string } } | undefined;
              if (turn?.status === "failed") setError(turn.error?.message || "The Codex turn failed.");
            }
            void refreshThreads();
            return;
          }
          if (threadId && threadId !== selectedRef.current) return;
          if (message.method === "item/agentMessage/delta") {
            const id = String(message.params.itemId || "streaming");
            const delta = String(message.params.delta || "");
            setItems((previous) => {
              const found = previous.find((item) => item.id === id);
              return found
                ? previous.map((item) => item.id === id ? { ...item, text: item.text + delta } : item)
                : [...previous, { id, role: "assistant", text: delta }];
            });
          } else if (message.method === "item/started" || message.method === "item/completed") {
            const item = message.params.item as Record<string, unknown> | undefined;
            if (!item || typeof item.id !== "string") return;
            if (item.type === "agentMessage" && message.method === "item/completed") {
              setItems((previous) => {
                const next: ChatItem = { id: item.id as string, role: "assistant", text: String(item.text || "") };
                return previous.some((entry) => entry.id === next.id)
                  ? previous.map((entry) => entry.id === next.id ? next : entry)
                  : [...previous, next];
              });
            } else if (item.type === "commandExecution" || item.type === "fileChange") {
              const next: ChatItem = {
                id: item.id,
                role: "activity",
                kind: item.type === "commandExecution" ? "Command" : "Files",
                text: item.type === "commandExecution" ? String(item.command || "Running command") : "File changes",
                status: String(item.status || "inProgress"),
              };
              setItems((previous) => previous.some((entry) => entry.id === next.id)
                ? previous.map((entry) => entry.id === next.id ? next : entry)
                : [...previous, next]);
            }
          }
        }),
        listen<ServerMessage>("codex-request", (event) => setApprovalQueue((previous) => [...previous, event.payload])),
        listen<string>("codex-status", (event) => {
          setConnectionDetail(event.payload);
          if (event.payload.toLowerCase().includes("disconnected")) setConnection("disconnected");
        }),
      ]);
      if (disposed) subscriptions.forEach((unlisten) => unlisten());
      else {
        unlisteners = subscriptions;
        await loadServer(settings.codexPath);
      }
    };
    void start();
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
    // The connection is established once. Changing settings uses the explicit Restart button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectThread(id: string) {
    selectedRef.current = id;
    setSelectedId(id);
    setSidebarOpen(false);
    setMenuOpen(false);
    setError(null);
    if (!inDesktop) {
      setItems(id === "demo-1" ? demoItems : [
        { id: "sample-u", role: "user", text: "Can you help me understand this project?" },
        { id: "sample-a", role: "assistant", text: "Yes. Pick a workspace in Settings, connect the Codex CLI, and start a new chat to work with your real files." },
      ]);
      return;
    }
    setItems([]);
    try {
      const result = await rpc("thread/read", { threadId: id, includeTurns: true });
      if (selectedRef.current === id) setItems(threadItems(result));
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  function newChat() {
    selectedRef.current = null;
    setSelectedId(null);
    setItems([]);
    setDraft("");
    setBusy(false);
    turnRef.current = null;
    setSidebarOpen(false);
    setMenuOpen(false);
    setError(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || busy || connection === "disconnected" || connection === "connecting") return;
    setDraft("");
    setError(null);
    setBusy(true);
    if (connection === "demo") {
      let id = selectedRef.current;
      if (!id) {
        id = `demo-${Date.now()}`;
        const thread = { id, name: text.slice(0, 48), preview: text, updatedAt: Date.now() / 1000 };
        selectedRef.current = id;
        setSelectedId(id);
        setThreads((previous) => [thread, ...previous]);
      }
      setItems((previous) => [...previous, { id: `user-${Date.now()}`, role: "user", text }]);
      setTimeout(() => {
        setItems((previous) => [...previous, {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: "This is a preview response. Install and sign in to the Codex CLI, then open TuxCodex to work with a real project.",
        }]);
        setBusy(false);
      }, 700);
      return;
    }
    try {
      let id = selectedRef.current;
      if (!id) {
        const params: Record<string, unknown> = {};
        if (settings.cwd.trim()) params.cwd = settings.cwd.trim();
        if (settings.model) params.model = settings.model;
        const result = await rpc<{ thread: Thread }>("thread/start", params);
        id = result.thread.id;
        selectedRef.current = id;
        setSelectedId(id);
        setItems([]);
      } else {
        await rpc("thread/resume", { threadId: id });
      }
      setItems((previous) => [...previous, { id: `local-${Date.now()}`, role: "user", text }]);
      const result = await rpc<{ turn: { id: string } }>("turn/start", {
        threadId: id,
        input: [{ type: "text", text }],
        ...(settings.model ? { model: settings.model } : {}),
      });
      turnRef.current = result.turn.id;
      void refreshThreads();
    } catch (failure) {
      setBusy(false);
      setError(errorText(failure));
    }
  }

  async function stopTurn() {
    if (!selectedRef.current || !turnRef.current || !inDesktop) return;
    try {
      await rpc("turn/interrupt", { threadId: selectedRef.current, turnId: turnRef.current });
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  async function handleApproval(decision: "accept" | "decline") {
    const request = approvalQueue[0];
    if (request?.id === undefined) return;
    try {
      await respondApproval(request.id, decision);
      setApprovalQueue((previous) => previous.slice(1));
    } catch (failure) {
      setError(errorText(failure));
      setApprovalQueue((previous) => previous.slice(1));
    }
  }

  async function archiveThread(remove = false) {
    if (!selectedId || !inDesktop) return;
    if (remove && !window.confirm("Permanently delete this chat and its history? This cannot be undone.")) return;
    try {
      await rpc(remove ? "thread/delete" : "thread/archive", { threadId: selectedId });
      newChat();
      await refreshThreads();
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  function saveSettings() {
    setSettings(draftSettings);
    setSettingsOpen(false);
  }

  async function openProject() {
    const url = "https://github.com/MoussaKassim/TuxCodex";
    if (!inDesktop) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      await openUrl(url);
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  const activeThread = threads.find((thread) => thread.id === selectedId);
  const matchingThreads = threads.filter((thread) => `${displayName(thread)} ${thread.cwd || ""}`.toLowerCase().includes(search.toLowerCase()));
  const approval = approvalQueue[0];
  const approvalParams = approval?.params || {};
  const approvalCommand = typeof approvalParams.command === "string" ? approvalParams.command : "";
  const approvalReason = typeof approvalParams.reason === "string" ? approvalParams.reason : "";
  const networkContext = approvalParams.networkApprovalContext as { host?: string; protocol?: string } | undefined;

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><Terminal size={21} strokeWidth={2.3} /></div>
          <div className="brand-copy"><strong>TuxCodex</strong><span>CODEX FOR LINUX</span></div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={18} /></button>
        </div>
        <button className="new-chat" onClick={newChat}><Plus size={18} /><span>New chat</span><span className="shortcut">Ctrl N</span></button>
        <div className="search-box"><Search size={17} /><input aria-label="Search chats" placeholder="Search chats" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="sidebar-section-title">CHATS <span>{matchingThreads.length}</span></div>
        <div className="thread-list">
          {matchingThreads.map((thread) => (
            <button key={thread.id} className={`thread-row ${selectedId === thread.id ? "active" : ""}`} onClick={() => void selectThread(thread.id)}>
              <MessageSquare size={16} />
              <span className="thread-text"><strong>{displayName(thread)}</strong><small>{thread.preview || shortPath(thread.cwd || "")}</small></span>
              <time>{formatDate(thread.updatedAt || thread.createdAt)}</time>
            </button>
          ))}
          {matchingThreads.length === 0 && <p className="empty-search">{search ? "No chats found" : "Your chats will appear here"}</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="connection-card">
            <span className={`status-dot ${connection}`} />
            <div><strong>{connection === "connected" ? "Codex connected" : connection === "demo" ? "Preview mode" : connection === "connecting" ? "Connecting…" : "Codex disconnected"}</strong><small>{connection === "demo" ? "Interface preview" : connection === "connected" ? (account || "Local app-server") : "Check your setup"}</small></div>
            {connection === "connected" && <Check size={15} className="connected-check" />}
          </div>
          <button className="sidebar-action" onClick={() => { setDraftSettings(settings); setSettingsOpen(true); }}><Settings2 size={18} /> Settings</button>
          <button className="sidebar-action help-link" onClick={() => void openProject()}><CircleHelp size={18} /> Project on GitHub</button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={20} /></button>
            <div className="workspace-glyph"><Code2 size={18} /></div>
            <div className="topbar-title"><strong>{activeThread ? displayName(activeThread) : "New chat"}</strong><small><FolderOpen size={13} /> {settings.cwd ? shortPath(settings.cwd) : "Choose a workspace in Settings"}</small></div>
            <ChevronDown size={15} className="title-chevron" />
          </div>
          <div className="topbar-right">
            <span className={`top-status ${connection}`}><span className="status-dot" />{connection === "connected" ? "Connected" : connection === "demo" ? "Preview" : connection === "connecting" ? "Connecting" : "Offline"}</span>
            <button className="icon-button top-settings" title="Settings" onClick={() => { setDraftSettings(settings); setSettingsOpen(true); }}><Settings2 size={19} /></button>
            {selectedId && inDesktop && <div className="menu-anchor"><button className="icon-button" title="Chat actions" onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={21} /></button>{menuOpen && <div className="dropdown-menu"><button onClick={() => void archiveThread()}><Archive size={16} /> Archive chat</button><button className="danger" onClick={() => void archiveThread(true)}><Trash2 size={16} /> Delete chat</button></div>}</div>}
          </div>
        </header>

        {connection === "disconnected" && <div className="setup-banner"><div className="banner-icon"><Terminal size={20} /></div><div><strong>Codex app-server is not connected</strong><p>{connectionDetail} Install the Codex CLI, run <code>codex login</code>, or set its path in Settings.</p></div><button onClick={() => void loadServer(settings.codexPath, true)}><RotateCcw size={15} /> Retry</button></div>}
        {connection === "connected" && authMissing && <div className="setup-banner"><div className="banner-icon"><Terminal size={20} /></div><div><strong>Sign in to Codex</strong><p>Run <code>codex login</code> in a terminal, then restart the server from Settings.</p></div></div>}
        {connection === "demo" && <div className="demo-banner"><CircleHelp size={16} /><span>{inDesktop ? `Offline preview. ${connectionDetail}` : "Browser preview. Open the Tauri desktop app to use Codex."}</span>{inDesktop && <button onClick={() => void loadServer(settings.codexPath, true)}><RotateCcw size={15} /> Retry</button>}</div>}
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error"><X size={16} /></button></div>}

        <div className="conversation-scroll">
          {items.length === 0 ? (
            <div className="welcome-state">
              <div className="welcome-icon"><Terminal size={32} strokeWidth={1.8} /></div>
              <span className="eyebrow">YOUR LINUX CODING COMPANION</span>
              <h1>What are we building?</h1>
              <p>Ask Codex to explore a codebase, make a change, or explain what it finds. Start with a workspace for project specific work.</p>
              <div className="suggestions">
                {["Explain this project", "Find a bug in my code", "Help me build a feature"].map((suggestion) => <button key={suggestion} onClick={() => { setDraft(suggestion); textareaRef.current?.focus(); }}><span>{suggestion}</span><ArrowUp size={15} /></button>)}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {items.map((item) => item.role === "activity" ? (
                <div key={item.id} className="activity-item"><div className="activity-icon">{item.kind === "Command" ? <Command size={15} /> : <Code2 size={15} />}</div><div><strong>{item.kind}</strong><code>{item.text}</code></div><span className={`activity-status ${item.status}`}>{item.status === "inProgress" ? "Running" : item.status || "Done"}</span></div>
              ) : (
                <div key={item.id} className={`message-row ${item.role}`}>
                  <div className={`avatar ${item.role}`}>{item.role === "assistant" ? <Terminal size={16} /> : "Y"}</div>
                  <div className="message-body"><div className="message-meta">{item.role === "assistant" ? "Codex" : "You"}</div><div className="message-text">{item.text || <span className="typing-indicator">Thinking…</span>}</div></div>
                </div>
              ))}
              {busy && !items.some((item) => item.role === "assistant" && item.text === "") && <div className="working-row"><span className="working-pulse" /> Codex is working…</div>}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="composer-zone">
          <div className="composer">
            <textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={connection === "disconnected" ? "Connect to Codex to start chatting…" : "Ask Codex anything…"} rows={2} disabled={connection === "connecting" || connection === "disconnected"} aria-label="Message to Codex" />
            <div className="composer-footer"><div className="composer-context"><FolderOpen size={15} /><span>{settings.cwd ? shortPath(settings.cwd) : "Default workspace"}</span></div><div className="composer-actions">{busy ? <button className="send-button stop-button" onClick={() => void stopTurn()} title="Stop turn" disabled={!turnRef.current}><Square size={15} fill="currentColor" /></button> : <button className="send-button" onClick={() => void sendMessage()} disabled={!draft.trim() || connection === "connecting" || connection === "disconnected"} title="Send message"><ArrowUp size={19} /></button>}</div></div>
          </div>
          <div className="composer-hint"><span>Codex can make mistakes. Review changes before applying them.</span><span><kbd>Enter</kbd> send <b>·</b> <kbd>Shift Enter</kbd> new line</span></div>
        </div>
      </main>

      {settingsOpen && <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><section className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings"><div className="modal-header"><div><span className="eyebrow">PREFERENCES</span><h2>Settings</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={20} /></button></div><div className="settings-content"><label><span>Workspace folder</span><small>Absolute path used for new Codex chats.</small><input value={draftSettings.cwd} onChange={(event) => setDraftSettings({ ...draftSettings, cwd: event.target.value })} placeholder="/home/you/projects/my-app" /></label><label><span>Codex CLI path</span><small>Leave empty to find <code>codex</code> automatically.</small><input value={draftSettings.codexPath} onChange={(event) => setDraftSettings({ ...draftSettings, codexPath: event.target.value })} placeholder="/home/you/.local/bin/codex" /></label><label><span>Model</span><small>Models come from your local Codex app-server.</small><select value={draftSettings.model} onChange={(event) => setDraftSettings({ ...draftSettings, model: event.target.value })}><option value="">Codex default</option>{models.map((model) => <option key={model.id} value={model.model || model.id}>{model.displayName || model.model || model.id}</option>)}</select></label><label><span>Appearance</span><select value={draftSettings.theme} onChange={(event) => setDraftSettings({ ...draftSettings, theme: event.target.value as Settings["theme"] })}><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></label><div className="server-info"><span className={`status-dot ${connection}`} /><div><strong>{connectionDetail}</strong><small>Authentication is managed by the Codex CLI. Run <code>codex login</code> in a terminal if needed.</small></div></div></div><div className="modal-footer"><button className="secondary-button" onClick={() => { saveSettings(); if (inDesktop) void loadServer(draftSettings.codexPath, true); }}><RotateCcw size={16} /> Save & restart server</button><button className="primary-button" onClick={saveSettings}>Save settings</button></div></section></div>}

      {approval && <div className="modal-scrim"><section className="approval-modal" role="alertdialog" aria-modal="true" aria-label="Codex approval request"><div className="approval-icon"><ShieldAlert size={24} /></div><span className="eyebrow">ACTION NEEDS APPROVAL</span><h2>{networkContext ? "Allow network access?" : approval.method.includes("fileChange") ? "Allow file changes?" : "Allow this command?"}</h2><p>{approvalReason || "Codex needs permission to continue this task."}</p>{networkContext?.host && <pre>{networkContext.protocol || "Network"}://{networkContext.host}</pre>}{!networkContext && approvalCommand && <pre>{approvalCommand}</pre>}{typeof approvalParams.cwd === "string" && <div className="approval-path"><FolderOpen size={15} />{approvalParams.cwd}</div>}<div className="approval-actions"><button className="secondary-button" onClick={() => void handleApproval("decline")}>Decline</button><button className="primary-button" onClick={() => void handleApproval("accept")}>Allow once</button></div></section></div>}
      <button className="scroll-bottom" onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })} title="Scroll to latest"><ArrowDown size={17} /></button>
    </div>
  );
}
