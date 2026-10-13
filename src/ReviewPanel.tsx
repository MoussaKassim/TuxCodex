import { Check, Circle, FileDiff, ListChecks, X } from "lucide-react";
import type { PlanStep } from "./types";

interface Props {
  diff: string;
  plan: PlanStep[];
  tab: "changes" | "plan";
  onTabChange: (tab: "changes" | "plan") => void;
  onClose: () => void;
}

function diffClass(line: string): string {
  if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("diff --git")) return "diff-file";
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("+")) return "diff-added";
  if (line.startsWith("-")) return "diff-removed";
  return "";
}

export default function ReviewPanel({ diff, plan, tab, onTabChange, onClose }: Props) {
  return <aside className="review-panel" aria-label="Work review">
    <div className="review-header"><div><span className="eyebrow">CURRENT CHAT</span><h2>Review</h2></div><button className="icon-button" onClick={onClose} aria-label="Close review"><X size={18} /></button></div>
    <div className="review-tabs" role="tablist" aria-label="Review views">
      <button role="tab" aria-selected={tab === "changes"} className={tab === "changes" ? "selected" : ""} onClick={() => onTabChange("changes")}><FileDiff size={15} /> Changes</button>
      <button role="tab" aria-selected={tab === "plan"} className={tab === "plan" ? "selected" : ""} onClick={() => onTabChange("plan")}><ListChecks size={15} /> Plan</button>
    </div>
    <div className="review-content">
      {tab === "changes" ? diff ? <div className="diff-view">{diff.split("\n").map((line, index) => <div key={index} className={`diff-line ${diffClass(line)}`}><span className="diff-number">{index + 1}</span><span>{line || " "}</span></div>)}</div> : <div className="review-empty"><FileDiff size={25} /><strong>No changes to review</strong><p>File changes from this chat will appear here as Codex works.</p></div>
      : plan.length ? <ol className="plan-list">{plan.map((entry, index) => <li key={`${entry.step}-${index}`} className={entry.status}><span>{entry.status === "completed" ? <Check size={14} /> : entry.status === "inProgress" ? <span className="working-pulse" /> : <Circle size={14} />}</span><div><strong>{entry.step}</strong><small>{entry.status === "inProgress" ? "In progress" : entry.status === "completed" ? "Completed" : "Pending"}</small></div></li>)}</ol> : <div className="review-empty"><ListChecks size={25} /><strong>No plan shared yet</strong><p>When Codex shares a plan, its progress will appear here.</p></div>}
    </div>
  </aside>;
}
