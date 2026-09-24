import type { SlideStatus } from "../domain/models";

export const STATUS_META: Record<
  SlideStatus,
  { label: string; className: string }
> = {
  available: { label: "在库可约", className: "badge-ok" },
  lent: { label: "借出中", className: "badge-watch" },
  pending: { label: "待检", className: "badge-danger" },
};

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", { hour12: false });
}
