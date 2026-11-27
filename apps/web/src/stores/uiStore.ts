import { create } from "zustand";
import type { FrozenSecretProfile } from "@/data/frozenBenchmarks";

export type NavPageId =
  | "overview"
  | "demo"
  | "studio"
  | "registry"
  | "unlinkability"
  | "privacy"
  | "policies";

interface UiState {
  activePage: NavPageId;
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;
  frozenProfile: FrozenSecretProfile;
  demoBarOpen: boolean;
  activeDemoStep: number;
  completedDemoSteps: string[];
  setActivePage: (page: NavPageId) => void;
  toggleSidebar: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  setFrozenProfile: (profile: FrozenSecretProfile) => void;
  setDemoBarOpen: (open: boolean) => void;
  setActiveDemoStep: (stepNumber: number) => void;
  toggleDemoStepCompleted: (stepId: string) => void;
  markDemoStepCompleted: (stepId: string) => void;
  resetDemoChecklist: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePage: "overview",
  sidebarCollapsed: false,
  mobileMenuOpen: false,
  frozenProfile: "audit-sec-A",
  demoBarOpen: false,
  activeDemoStep: 1,
  completedDemoSteps: [],
  setActivePage: (page) => set({ activePage: page, mobileMenuOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
  setFrozenProfile: (profile) => set({ frozenProfile: profile }),
  setDemoBarOpen: (open) => set({ demoBarOpen: open }),
  setActiveDemoStep: (stepNumber) => set({ activeDemoStep: stepNumber }),
  toggleDemoStepCompleted: (stepId) =>
    set((s) => ({
      completedDemoSteps: s.completedDemoSteps.includes(stepId)
        ? s.completedDemoSteps.filter((id) => id !== stepId)
        : [...s.completedDemoSteps, stepId],
    })),
  markDemoStepCompleted: (stepId) =>
    set((s) => ({
      completedDemoSteps: s.completedDemoSteps.includes(stepId)
        ? s.completedDemoSteps
        : [...s.completedDemoSteps, stepId],
    })),
  resetDemoChecklist: () => set({ completedDemoSteps: [], activeDemoStep: 1 }),
}));
