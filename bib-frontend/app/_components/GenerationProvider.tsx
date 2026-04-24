"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Content, GenerateInput, RegenerateInput } from "@/lib/types";

export type JobType = "generate" | "regenerate";
export type JobStatus = "pending" | "generating" | "done" | "error";

export interface GenerationJob {
  id: string;
  type: JobType;
  status: JobStatus;
  label: string;
  payload: GenerateInput | RegenerateInput;
  result?: Content;
  error?: string;
}

interface GenerationContextValue {
  jobs: GenerationJob[];
  addJob: (type: JobType, payload: GenerateInput | RegenerateInput, label: string) => void;
  dismissJob: (id: string) => void;
  isQueueActive: boolean;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const processingRef = useRef<string | null>(null);

  const addJob = useCallback((type: JobType, payload: GenerateInput | RegenerateInput, label: string) => {
    const id = crypto.randomUUID();
    setJobs((prev) => [...prev, { id, type, status: "pending", label, payload }]);
  }, []);

  const dismissJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  // Queue processor: runs whenever jobs change
  useEffect(() => {
    const isGenerating = jobs.some((j) => j.status === "generating");
    if (isGenerating) return;

    const next = jobs.find((j) => j.status === "pending");
    if (!next) return;
    if (processingRef.current === next.id) return;

    processingRef.current = next.id;
    const { id, type, payload, label } = next;

    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: "generating" } : j)));

    const call =
      type === "regenerate"
        ? api.regenerate(payload as RegenerateInput)
        : api.generate(payload as GenerateInput);

    call
      .then((result) => {
        processingRef.current = null;
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: "done", result } : j)));
        toast.success(`"${label}" gerada com sucesso!`, {
          action: {
            label: "Ver resultado →",
            onClick: () => router.push(`/contents/${result.id}`),
          },
          duration: 10000,
        });
      })
      .catch((err) => {
        processingRef.current = null;
        const error = err instanceof Error ? err.message : "Erro desconhecido";
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: "error", error } : j)));
        toast.error(`Erro ao gerar "${label}": ${error}`);
      });
  }, [jobs, router]);

  return (
    <GenerationContext.Provider
      value={{
        jobs,
        addJob,
        dismissJob,
        isQueueActive: jobs.some((j) => j.status === "pending" || j.status === "generating"),
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error("useGeneration must be used within GenerationProvider");
  return ctx;
}
