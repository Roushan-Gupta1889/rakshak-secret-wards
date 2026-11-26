import * as React from "react";
import {
  Activity,
  ChevronRight,
  Database,
  FileKey2,
  FlaskConical,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { useHealthQuery } from "@/api/queries";
import { ApiStatusPill } from "@/components/common/ApiStatusPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { cn } from "@/lib/utils";
import { useUiStore, type NavPageId } from "@/stores/uiStore";

interface NavItem {
  id: NavPageId;
  label: string;
  group: "MONITORING" | "WORKFLOW" | "UPCOMING MODULES" | "GOVERNANCE";
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", group: "MONITORING", icon: LayoutDashboard },
  { id: "studio", label: "Sanitization Studio", group: "WORKFLOW", icon: FlaskConical },
  { id: "registry", label: "Medical Registry", group: "WORKFLOW", icon: Database },
  { id: "unlinkability", label: "Unlinkability Lab", group: "UPCOMING MODULES", icon: FileKey2, badge: "2E" },
  { id: "privacy", label: "Privacy Analytics", group: "UPCOMING MODULES", icon: Activity, badge: "2E" },
  { id: "policies", label: "Policies & Architecture", group: "GOVERNANCE", icon: Scale },
];

const NAV_GROUPS: NavItem["group"][] = ["MONITORING", "WORKFLOW", "UPCOMING MODULES", "GOVERNANCE"];

function SidebarContent({
  collapsed,
  activePage,
  onSelect,
}: {
  collapsed: boolean;
  activePage: NavPageId;
  onSelect: (id: NavPageId) => void;
}) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div
          className={cn(
            "flex items-center gap-2.5 border-b border-slate-800/80 px-3 py-3.5",
            collapsed ? "justify-center" : "",
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-500/35 bg-cyan-500/10 text-cyan-300">
            <ShieldCheck className="h-4 w-4" />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight text-slate-100">
                RAKSHAK
              </div>
              <div className="truncate font-mono text-[10px] uppercase tracking-wider text-cyan-300/85">
                Secret Wards Console
              </div>
            </div>
          ) : null}
        </div>

        <nav aria-label="Primary navigation" className="mt-3 space-y-5 px-2">
          {NAV_GROUPS.map((group) => {
            const items = NAV_ITEMS.filter((it) => it.group === group);
            return (
              <div key={group}>
                {!collapsed ? (
                  <div className="mb-1.5 px-2 font-mono text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    {group}
                  </div>
                ) : null}
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = activePage === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item.id)}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                          active
                            ? "border-cyan-500/35 bg-cyan-500/12 text-cyan-200"
                            : "border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
                          collapsed ? "justify-center px-2" : "",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Icon className={cn("h-4 w-4 shrink-0", active ? "text-cyan-300" : "text-slate-400")} />
                          {!collapsed ? <span className="truncate">{item.label}</span> : null}
                        </span>
                        {!collapsed && item.badge ? (
                          <span className="rounded border border-slate-700/80 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {!collapsed ? (
        <div className="border-t border-slate-800/80 p-3">
          <div className="rounded-md border border-slate-800/90 bg-[#090E1B] px-2.5 py-2 text-[11px] text-slate-400">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-slate-300">
              <span>Local Boundary</span>
              <span className="text-emerald-400">OFFLINE</span>
            </div>
            <p className="mt-1 leading-relaxed text-slate-400">
              Stage 1 engine frozen at <code className="font-mono text-slate-300">phase-1e-v1</code>. Zero external network calls.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const {
    activePage,
    sidebarCollapsed,
    mobileMenuOpen,
    setActivePage,
    toggleSidebar,
    setMobileMenuOpen,
  } = useUiStore();

  const healthQuery = useHealthQuery();
  const health = healthQuery.data?.data;
  const currentItem = NAV_ITEMS.find((n) => n.id === activePage) ?? NAV_ITEMS[0];

  return (
    <div className="flex min-h-screen bg-[#070B14] text-slate-100">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-slate-800/85 bg-[#090F1D] transition-[width] duration-150 md:block",
          sidebarCollapsed ? "w-16" : "w-60",
        )}
      >
        <div className="sticky top-0 h-screen">
          <SidebarContent
            collapsed={sidebarCollapsed}
            activePage={activePage}
            onSelect={setActivePage}
          />
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      <MobileDrawer
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        title="RAKSHAK Navigation"
      >
        <SidebarContent
          collapsed={false}
          activePage={activePage}
          onSelect={setActivePage}
        />
      </MobileDrawer>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-800/85 bg-[#090F1D]/95 px-4 backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-2.5">
            <Button
              size="icon"
              variant="ghost"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="hidden md:inline-flex"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>

            <div className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="hidden font-mono text-slate-400 sm:inline">Secret Wards</span>
              <ChevronRight className="hidden h-3.5 w-3.5 text-slate-600 sm:inline" />
              <span className="truncate font-medium text-slate-100">{currentItem.label}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="cyan" className="hidden sm:inline-flex">
              <WifiOff className="h-3 w-3" />
              OFFLINE-FIRST
            </Badge>

            <Badge variant="default" className="hidden lg:inline-flex">
              ENGINE · {health ? `${health.engine_tag} (v${health.engine_version})` : "phase-1e-v1"}
            </Badge>

            <ApiStatusPill
              health={health}
              latencyMs={healthQuery.data?.latencyMs}
              isLoading={healthQuery.isLoading}
              isError={healthQuery.isError}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
