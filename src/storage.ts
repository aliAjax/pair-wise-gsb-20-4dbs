// 保存：台账的本地持久化。只负责读写 localStorage，不含业务判断。
// 换班、重开页面后从这里恢复，待检、借出与整盒余量都能对得上。

import { seedState, type DeskState } from "./data";

const STORAGE_KEY = "hxwl-06-slide-desk:v1";

function isDeskState(value: unknown): value is DeskState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.slides) &&
    Array.isArray(v.reservations) &&
    Array.isArray(v.loans) &&
    Array.isArray(v.inspections)
  );
}

export function loadState(): DeskState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed: unknown = JSON.parse(raw);
    return isDeskState(parsed) ? parsed : seedState();
  } catch {
    return seedState();
  }
}

export function saveState(state: DeskState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用（如隐私模式）时仅本次会话有效，不阻断操作
  }
}

export function resetState(): DeskState {
  const fresh = seedState();
  saveState(fresh);
  return fresh;
}
