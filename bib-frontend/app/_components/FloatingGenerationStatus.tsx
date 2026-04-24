"use client";

import Link from "next/link";
import { useGeneration, GenerationJob } from "./GenerationProvider";

function Spinner() {
  return (
    <div className="w-3.5 h-3.5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin shrink-0" />
  );
}

function JobRow({ job, onDismiss }: { job: GenerationJob; onDismiss: () => void }) {
  if (job.status === "pending") {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs text-gray-500">
        <span className="text-gray-400 shrink-0">⏳</span>
        <span className="truncate">Em fila: <span className="font-medium text-gray-700">{job.label}</span></span>
      </div>
    );
  }

  if (job.status === "generating") {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs text-gray-600">
        <Spinner />
        <span className="truncate">A gerar: <span className="font-medium text-gray-800">{job.label}</span></span>
      </div>
    );
  }

  if (job.status === "done" && job.result) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs">
        <span className="text-emerald-500 shrink-0">✓</span>
        <span className="text-gray-700 truncate flex-1">
          <span className="font-medium">{job.label}</span> pronta
        </span>
        <Link
          href={`/contents/${job.result.id}`}
          onClick={onDismiss}
          className="text-blue-600 hover:underline shrink-0 ml-1"
        >
          Ver →
        </Link>
        <button
          onClick={onDismiss}
          className="text-gray-300 hover:text-gray-500 shrink-0 ml-1 transition-colors"
          aria-label="Dispensar"
        >
          ✕
        </button>
      </div>
    );
  }

  if (job.status === "error") {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs">
        <span className="text-red-500 shrink-0">✕</span>
        <span className="text-red-600 truncate flex-1">Erro: {job.label}</span>
        <button
          onClick={onDismiss}
          className="text-gray-300 hover:text-gray-500 shrink-0 ml-1 transition-colors"
          aria-label="Dispensar"
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}

export function FloatingGenerationStatus() {
  const { jobs, dismissJob } = useGeneration();

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-2 min-w-[260px] max-w-[340px]">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
        Geração
      </div>
      <div className="divide-y divide-gray-100">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} onDismiss={() => dismissJob(job.id)} />
        ))}
      </div>
    </div>
  );
}
