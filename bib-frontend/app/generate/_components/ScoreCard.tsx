"use client";

import { Content } from "@/lib/types";

function scoreConfig(score: number) {
  if (score >= 75) return { cls: "bg-emerald-50 border-emerald-200 text-emerald-800", label: "Bom" };
  if (score >= 50) return { cls: "bg-amber-50 border-amber-200 text-amber-800", label: "Aceitável" };
  return { cls: "bg-red-50 border-red-200 text-red-800", label: "Fraco" };
}

export function ScoreCard({ content }: { content: Content }) {
  const score = content.score ?? 0;
  const issues = content.score_issues ?? [];
  const { cls, label } = scoreConfig(score);

  return (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold">{score}</span>
        <span className="text-sm opacity-70">/100 — {label}</span>
      </div>
      {issues.length > 0 ? (
        <ul className="text-xs space-y-1 opacity-80">
          {issues.map((issue, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="shrink-0 mt-0.5">·</span>
              {issue}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs opacity-70">Sem problemas detectados.</p>
      )}
    </div>
  );
}
