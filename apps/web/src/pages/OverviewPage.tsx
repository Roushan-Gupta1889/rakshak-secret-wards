import { CoreKpisSection } from "@/components/overview/CoreKpisSection";
import { FrozenBenchmarkSection } from "@/components/overview/FrozenBenchmarkSection";
import { SystemHealthSection } from "@/components/overview/SystemHealthSection";

export function OverviewPage() {
  return (
    <div className="space-y-8">
      <SystemHealthSection />
      <CoreKpisSection />
      <FrozenBenchmarkSection />
    </div>
  );
}
