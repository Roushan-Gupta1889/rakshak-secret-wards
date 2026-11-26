import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function EChartBox({
  option,
  height = 280,
  loading = false,
  className,
}: {
  option: echarts.EChartsCoreOption;
  height?: number;
  loading?: boolean;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || loading) return;

    const inst = echarts.init(el, undefined, { renderer: "svg" });
    chartRef.current = inst;
    inst.setOption(option);

    const observer = new ResizeObserver(() => {
      inst.resize();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      inst.dispose();
      chartRef.current = null;
    };
  }, [loading, option]);

  useEffect(() => {
    if (chartRef.current && !loading) {
      chartRef.current.setOption(option, { notMerge: true });
    }
  }, [option, loading]);

  if (loading) {
    return <Skeleton className={cn("w-full", className)} />;
  }

  return <div ref={hostRef} style={{ height }} className={cn("w-full", className)} />;
}
