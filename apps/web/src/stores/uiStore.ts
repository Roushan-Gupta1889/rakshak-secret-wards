import { create } from "zustand";
import type { FrozenSecretProfile } from "@/data/frozenBenchmarks";

export type NavPageId =
  | "overview"
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
  setActivePage: (page: NavPageId) => void;
  toggleSidebar: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  setFrozenProfile: (profile: FrozenSecretProfile) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePage: "overview",
  sidebarCollapsed: false,
  mobileMenuOpen: false,
  frozenProfile: "audit-sec-A",
  setActivePage: (page) => set({ activePage: page, mobileMenuOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
  setFrozenProfile: (profile) => set({ frozenProfile: profile }),
}));
