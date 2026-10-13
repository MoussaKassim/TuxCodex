import { Check, Circle, FileDiff, GitBranch, ListChecks, RotateCcw, X } from "lucide-react";
import type { GitSnapshot, PlanStep } from "./types";

export type ReviewTab = "chat" | "git" | "plan";

interface Props {
  chatDiff: string;
  plan: PlanStep[];
  git: GitSnapshot | null;
  gitLoading: boolean;
  gitError: string | null;
  canReview: boolean;
  tab: ReviewTab;
  onTabChange: (tab: ReviewTab) => void;
  onRefreshGit: () => void;
  onReview: () => void;
  onClose: () => void;
}

function diffClass(line: string): string {
  if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("diff --git")) return "diff-file";
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("+")) return "diff-added";
  if (line.startsWith("-")) return "diff-removed";
  return "";
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return <div className="diff-view">{lines.slice(0, 4000).map((line, index) => <div key={index} className={`diff-line ${diffClass(line)}`}><span className="diff-number">{index + 1}</span><span>{line || " "}</span></div>)}{lines.length > 4000 && <p className="diff-limit">Showing the first 4,000 lines. Open the repository in an editor for the full diff.</p>}</div>;
}

function Empty({ icon, title, detail }: { icon: "chat" | "git" | "plan"; title: string; detail: string }) {
  return <div className="review-empty">{icon === "chat" ? <FileDiff size={25} /> : icon === "git" ? <GitBranch size={25} /> : <ListChecks size={25} />}<strong>{title}</strong><p>{detail}</p></div>;
}

function fileStatus(code: string): string {
  if (code === "??") return "Untracked";
  if (code.includes("A")) return "Added";
  if (code.includes("D")) return "Deleted";
  if (code.includes("R")) return "Renamed";
  if (code.includes("M")) return "Modified";
  return code.trim() || "Changed";
}

export default function ReviewPanel({ chatDiff, plan, git, gitLoading, gitError, canReview, tab, onTabChange, onRefreshGit, onReview, onClose }: Props) {
  return <aside className="review-panel" aria-label="Work review">
    <div className="review-header"><div><span className="eyebrow">WORKSPACE</span><h2>Review</h2></div><button className="icon-button" onClick={onClose} aria-label="Close review"><X size={18} /></button></div>
    <div className="review-tabs" role="tablist" aria-label="Review views">
      <button role="tab" aria-selected={tab === "chat"} className={tab === "chat" ? "selected" : ""} onClick={() => onTabChange("chat")}><FileDiff size={15} /> Chat</button>
      <button role="tab" aria-selected={tab === "git"} className={tab === "git" ? "selected" : ""} onClick={() => onTabChange("git")}><GitBranch size={15} /> Git</button>
      <button role="tab" aria-selected={tab === "plan"} className={tab === "plan" ? "selected" : ""} onClick={() => onTabChange("plan")}><ListChecks size={15} /> Plan</button>
    </div>
    <div className="review-content">
      {tab === "chat" && (chatDiff ? <DiffView diff={chatDiff} /> : <Empty icon="chat" title="No chat changes yet" detail="File changes reported by Codex in this chat will appear here." />)}
      {tab === "git" && <>
        <div className="git-review-toolbar"><div><strong>{git?.branch || "Repository changes"}</strong><small title={git?.root}>{git ? `${git.isWorktree ? "Worktree" : "Local checkout"} · ${git.files.length} changed ${git.files.length === 1 ? "file" : "files"}` : "Current workspace"}</small></div><button className="icon-button" onClick={onRefreshGit} disabled={gitLoading} title="Refresh Git changes" aria-label="Refresh Git changes"><RotateCcw size={16} /></button></div>
        {gitLoading ? <Empty icon="git" title="Reading Git changes…" detail="Checking the selected workspace." /> : gitError ? <Empty icon="git" title="Git review unavailable" detail={gitError} /> : git ? <>
          {git.files.length > 0 && <><button className="git-review-action" onClick={onReview} disabled={!canReview}>Review changes with Codex</button><ul className="git-file-list">{git.files.map((file) => <li key={file.path}><span title={fileStatus(file.status)}>{file.status}</span><code title={file.path}>{file.path}</code></li>)}</ul></>}
          {git.diff ? <DiffView diff={git.diff} /> : <Empty icon="git" title={git.files.length ? "No text diff available" : "Working tree is clean"} detail={git.files.length ? "Binary or large untracked files are listed above; open the repository to inspect them." : "Staged, unstaged, and untracked changes will appear here."} />}
        </> : <Empty icon="git" title="Choose a Git workspace" detail="Select a repository folder in Settings to inspect its changes." />}
      </>}
      {tab === "plan" && (plan.length ? <ol className="plan-list">{plan.map((entry, index) => <li key={`${entry.step}-${index}`} className={entry.status}><span>{entry.status === "completed" ? <Check size={14} /> : entry.status === "inProgress" ? <span className="working-pulse" /> : <Circle size={14} />}</span><div><strong>{entry.step}</strong><small>{entry.status === "inProgress" ? "In progress" : entry.status === "completed" ? "Completed" : "Pending"}</small></div></li>)}</ol> : <Empty icon="plan" title="No plan shared yet" detail="When Codex shares a plan, its progress will appear here." />)}
    </div>
  </aside>;
}
