import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortSha(sha: string | null | undefined, len = 12): string {
  if (!sha) return "—";
  return sha.slice(0, len);
}

export function formatPct(val: number, decimals = 1): string {
  return `${(val * 100).toFixed(decimals)}%`;
}
