import { create } from "zustand";
import { RunIdSchema, type RunSummaryResponse } from "@/api/schemas";

const SESSION_RUN_ID_KEY = "rakshak.session_run_id";

function readSessionRunId(): string | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(SESSION_RUN_ID_KEY);
    if (!raw) return null;
    const parsed = RunIdSchema.safeParse(raw);
    return parsed.success ? parsed.data.toLowerCase() : null;
  } catch {
    return null;
  }
}

function writeSessionRunId(runId: string | null): void {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    if (runId === null) {
      window.sessionStorage.removeItem(SESSION_RUN_ID_KEY);
      return;
    }
    const parsed = RunIdSchema.safeParse(runId);
    if (parsed.success) {
      window.sessionStorage.setItem(SESSION_RUN_ID_KEY, parsed.data.toLowerCase());
    }
  } catch {
    // Ignore storage access errors in locked-down browser contexts
  }
}

export interface DeletedRunNotice {
  runId: string;
  deletedAtIso: string;
}

interface RunState {
  activeRunId: string | null;
  activeRun: RunSummaryResponse | null;
  deletedNotice: DeletedRunNotice | null;
  sessionNotice: string | null;
  setActiveRun: (summary: RunSummaryResponse) => void;
  markRunDeleted: (runId: string) => void;
  clearExpiredSessionRun: (message: string) => void;
  clearActiveRunView: () => void;
}

export const useRunStore = create<RunState>((set) => ({
  activeRunId: readSessionRunId(),
  activeRun: null,
  deletedNotice: null,
  sessionNotice: null,
  setActiveRun: (summary) => {
    writeSessionRunId(summary.run_id);
    set({
      activeRunId: summary.run_id,
      activeRun: summary,
      deletedNotice: null,
      sessionNotice: null,
    });
  },
  markRunDeleted: (runId) => {
    writeSessionRunId(null);
    set({
      activeRunId: null,
      activeRun: null,
      deletedNotice: {
        runId,
        deletedAtIso: new Date().toISOString(),
      },
      sessionNotice: null,
    });
  },
  clearExpiredSessionRun: (message) => {
    writeSessionRunId(null);
    set({
      activeRunId: null,
      activeRun: null,
      sessionNotice: message,
    });
  },
  clearActiveRunView: () => {
    writeSessionRunId(null);
    set({
      activeRunId: null,
      activeRun: null,
      deletedNotice: null,
      sessionNotice: null,
    });
  },
}));

