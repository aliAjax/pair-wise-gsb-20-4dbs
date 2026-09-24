// 保存层：只负责存档的读取、校验与写入。业务规则不在这一层。
// 换班或重开页面后，待检、借出与整盒余量都从同一份 localStorage 存档恢复。

import { createInitialState, normalized } from "../domain/rules";
import type { DeskState } from "../domain/models";

const STORAGE_KEY = "hxwl-06.slide-desk.v1";

export interface LoadResult {
  state: DeskState;
  /** 是否为首次使用的空白台账 */
  fresh: boolean;
  /** 加载时做过自愈修正，需要立刻回写 */
  repaired: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 最小结构校验：挡掉手改坏的存档，再交给判断层按流水自愈。 */
function looksLikeState(value: unknown): value is DeskState {
  if (!isObject(value)) return false;
  if (!Array.isArray(value.loans) || !Array.isArray(value.reservations)) return false;
  if (!isObject(value.slides)) return false;
  return true;
}

export function loadState(now: string): LoadResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { state: createInitialState(now), fresh: true, repaired: false };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!looksLikeState(parsed)) {
      return { state: createInitialState(now), fresh: true, repaired: false };
    }

    const before = normalized(parsed as DeskState);
    const mismatched =
      JSON.stringify(before.slides) !==
      JSON.stringify((parsed as DeskState).slides);

    return { state: before, fresh: false, repaired: mismatched };
  } catch {
    return { state: createInitialState(now), fresh: true, repaired: false };
  }
}

export function saveState(state: DeskState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默失败：页面操作仍可用，只是重开后不保留。
  }
}

export function resetState(now: string): DeskState {
  const state = createInitialState(now);
  saveState(state);
  return state;
}

/** 模拟换班：直接重读存档，证明状态不依赖内存。 */
export function reloadState(now: string): LoadResult {
  return loadState(now);
}
