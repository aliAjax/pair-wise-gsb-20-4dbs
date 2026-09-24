// 判断层：借还台的全部业务规则。纯函数、无副作用，不读写存储、不碰 DOM。

import { SLIDES, slideDef } from "../data/catalog";
import type {
  DeskState,
  Loan,
  Reservation,
  SlideRuntime,
  SlideStatus,
} from "./models";

export class RuleError extends Error {}

let seq = 0;
function nextId(prefix: string, now: string): string {
  seq = (seq + 1) % 1_000_000;
  return `${prefix}-${Date.parse(now) || now.length}-${seq}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createInitialState(now: string): DeskState {
  const slides: Record<string, SlideRuntime> = {};
  for (const def of SLIDES) {
    slides[def.id] = { status: "available" };
  }
  return { version: 1, updatedAt: now, slides, reservations: [], loans: [] };
}

function requireSlide(state: DeskState, slideId: string) {
  const def = slideDef(slideId);
  if (!def) throw new RuleError("未登记的玻片编号");
  const runtime = state.slides[slideId];
  if (!runtime) throw new RuleError("该玻片没有状态登记");
  return { def, runtime };
}

function requireText(label: string, value: string) {
  const text = value.trim();
  if (!text) throw new RuleError(`请填写${label}`);
  return text;
}

/** 同一课次只能留一个借用人：待转借的预约和未归还的借出都算占用。 */
export function findLessonOccupant(
  state: DeskState,
  slideId: string,
  lesson: string
): { kind: "reservation"; who: string } | { kind: "loan"; who: string } | null {
  const reserved = state.reservations.find(
    (r) => r.slideId === slideId && r.lesson === lesson && !r.loanId
  );
  if (reserved) return { kind: "reservation", who: reserved.student };

  const lent = state.loans.find(
    (l) =>
      l.slideId === slideId &&
      l.lesson === lesson &&
      !l.returnedAt &&
      !l.replacedAt
  );
  if (lent) return { kind: "loan", who: lent.student };

  return null;
}

/** 学生按课次预约。 */
export function reserve(
  prev: DeskState,
  input: { slideId: string; student: string; lesson: string; now: string }
): DeskState {
  const state = clone(prev);
  const { runtime } = requireSlide(state, input.slideId);
  const student = requireText("借用人", input.student);
  const lesson = requireText("课次", input.lesson);

  if (runtime.status === "lent") throw new RuleError("玻片已借出，暂不能预约");
  if (runtime.status === "pending")
    throw new RuleError("玻片处于待检，补片完成前不能再次预约");

  const occupant = findLessonOccupant(state, input.slideId, lesson);
  if (occupant) {
    const action = occupant.kind === "reservation" ? "已被预约" : "已被借走";
    throw new RuleError(`该课次${action}：${occupant.who}（${lesson}）`);
  }

  const reservation: Reservation = {
    id: nextId("R", input.now),
    slideId: input.slideId,
    student,
    lesson,
    createdAt: input.now,
  };
  state.reservations.push(reservation);
  state.updatedAt = input.now;
  return state;
}

/** 取消预约（仅未转借出的预约可取消）。 */
export function cancelReservation(
  prev: DeskState,
  reservationId: string,
  now: string
): DeskState {
  const state = clone(prev);
  const target = state.reservations.find((r) => r.id === reservationId);
  if (!target) throw new RuleError("找不到该预约");
  if (target.loanId) throw new RuleError("该预约已经借出，不能取消");
  state.reservations = state.reservations.filter((r) => r.id !== reservationId);
  state.updatedAt = now;
  return state;
}

function lendExisting(
  state: DeskState,
  slideId: string,
  student: string,
  lesson: string,
  now: string,
  reservationId?: string
): Loan {
  const runtime = state.slides[slideId];
  if (runtime.status === "lent") throw new RuleError("玻片已借出，不能重复借出");
  if (runtime.status === "pending")
    throw new RuleError("玻片处于待检，补片完成前不能借出");

  const occupant = findLessonOccupant(state, slideId, lesson);
  if (occupant && (!reservationId || occupant.who !== student)) {
    throw new RuleError(`该课次已被占用：${occupant.who}（${lesson}）`);
  }

  const loan: Loan = {
    id: nextId("L", now),
    slideId,
    student,
    lesson,
    lentAt: now,
  };
  state.loans.push(loan);
  runtime.status = "lent";
  runtime.activeLoanId = loan.id;

  if (reservationId) {
    const reservation = state.reservations.find((r) => r.id === reservationId);
    if (reservation) reservation.loanId = loan.id;
  }
  return loan;
}

/** 预约转借出：由管理员核对学生与课次后办理。 */
export function lendReservation(
  prev: DeskState,
  reservationId: string,
  now: string
): DeskState {
  const state = clone(prev);
  const reservation = state.reservations.find((r) => r.id === reservationId);
  if (!reservation) throw new RuleError("找不到该预约");
  if (reservation.loanId) throw new RuleError("该预约已经借出");
  requireSlide(state, reservation.slideId);

  lendExisting(
    state,
    reservation.slideId,
    reservation.student,
    reservation.lesson,
    now,
    reservation.id
  );
  state.updatedAt = now;
  return state;
}

/** 未预约直接借用（管理员现场登记）。同一课次仍只能留一个借用人。 */
export function walkInLend(
  prev: DeskState,
  input: { slideId: string; student: string; lesson: string; now: string }
): DeskState {
  const state = clone(prev);
  requireSlide(state, input.slideId);
  const student = requireText("借用人", input.student);
  const lesson = requireText("课次", input.lesson);
  lendExisting(state, input.slideId, student, lesson, input.now);
  state.updatedAt = input.now;
  return state;
}

/**
 * 归还登记。
 * 位置放错或盖片破损 → 必须写处理意见，玻片转入待检，补片完成前不能再次预约。
 * 正常归还 → 玻片重新在库可约。
 */
export function returnSlide(
  prev: DeskState,
  input: {
    loanId: string;
    actualBoxId: string;
    damaged: boolean;
    note: string;
    now: string;
  }
): DeskState {
  const state = clone(prev);
  const loan = state.loans.find((l) => l.id === input.loanId);
  if (!loan) throw new RuleError("找不到该借出记录");
  if (loan.returnedAt) throw new RuleError("该记录已经归还");

  const { def, runtime } = requireSlide(state, loan.slideId);
  const actualBoxId = requireText("归还盒位", input.actualBoxId);
  const positionWrong = actualBoxId !== def.boxId;
  const note = input.note.trim();

  if ((positionWrong || input.damaged) && !note) {
    throw new RuleError("归还有问题时必须填写管理员处理意见");
  }

  loan.returnedAt = input.now;
  loan.actualBoxId = actualBoxId;
  loan.positionWrong = positionWrong;
  loan.damaged = input.damaged;
  loan.note = note || undefined;

  if (positionWrong || input.damaged) {
    loan.inspectedAt = input.now;
    runtime.status = "pending";
    runtime.activeLoanId = undefined;
  } else {
    runtime.status = "available";
    runtime.activeLoanId = undefined;
  }

  state.updatedAt = input.now;
  return state;
}

/** 补片完成：待检玻片回到登记盒位、恢复可预约。 */
export function markReplaced(
  prev: DeskState,
  slideId: string,
  now: string
): DeskState {
  const state = clone(prev);
  const { runtime } = requireSlide(state, slideId);
  if (runtime.status !== "pending")
    throw new RuleError("只有待检玻片可以登记补片完成");

  const openLoan = [...state.loans]
    .reverse()
    .find((l) => l.slideId === slideId && l.inspectedAt && !l.replacedAt);
  if (openLoan) openLoan.replacedAt = now;

  runtime.status = "available";
  runtime.activeLoanId = undefined;
  state.updatedAt = now;
  return state;
}

// ---- 派生查询：余量、待检/借出统计与对账，全部由台账推导 ----

export function activeReservations(state: DeskState): Reservation[] {
  return state.reservations.filter((r) => !r.loanId);
}

export function activeLoans(state: DeskState): Loan[] {
  return state.loans.filter((l) => !l.returnedAt && !l.replacedAt);
}

export function pendingSlides(state: DeskState): string[] {
  return Object.entries(state.slides)
    .filter(([, rt]) => rt.status === "pending")
    .map(([id]) => id);
}

/** 由台账推导的应有状态，作为对账依据（真相来源是 loans 流水）。 */
export function deriveStatus(state: DeskState, slideId: string): SlideStatus {
  const openLoan = state.loans.find(
    (l) => l.slideId === slideId && !l.returnedAt && !l.replacedAt
  );
  if (openLoan) return "lent";
  const pending = state.loans.some(
    (l) => l.slideId === slideId && l.inspectedAt && !l.replacedAt
  );
  if (pending) return "pending";
  return "available";
}

export interface BoxSummary {
  boxId: string;
  total: number;
  available: number;
  lent: number;
  pending: number;
}

/** 整盒余量：在库数 = 总数 - 借出 - 待检。 */
export function boxSummaries(state: DeskState): BoxSummary[] {
  const map = new Map<string, BoxSummary>();
  for (const def of SLIDES) {
    let summary = map.get(def.boxId);
    if (!summary) {
      summary = {
        boxId: def.boxId,
        total: 0,
        available: 0,
        lent: 0,
        pending: 0,
      };
      map.set(def.boxId, summary);
    }
    summary.total += 1;
    const status = state.slides[def.id]?.status ?? deriveStatus(state, def.id);
    if (status === "lent") summary.lent += 1;
    else if (status === "pending") summary.pending += 1;
    else summary.available += 1;
  }
  return [...map.values()];
}

export interface ReconcileItem {
  slideId: string;
  stored: SlideStatus | "missing";
  derived: SlideStatus;
}

/** 换班对账：存档状态逐张与台账推导结果核对。 */
export function reconcile(state: DeskState): {
  ok: boolean;
  mismatches: ReconcileItem[];
} {
  const mismatches: ReconcileItem[] = [];
  for (const def of SLIDES) {
    const stored = state.slides[def.id]?.status ?? "missing";
    const derived = deriveStatus(state, def.id);
    if (stored !== derived) mismatches.push({ slideId: def.id, stored, derived });
  }
  return { ok: mismatches.length === 0, mismatches };
}

export interface DeskCounters {
  total: number;
  available: number;
  lent: number;
  pending: number;
  reservations: number;
}

export function deskCounters(state: DeskState): DeskCounters {
  const summaries = boxSummaries(state);
  return {
    total: summaries.reduce((n, b) => n + b.total, 0),
    available: summaries.reduce((n, b) => n + b.available, 0),
    lent: summaries.reduce((n, b) => n + b.lent, 0),
    pending: summaries.reduce((n, b) => n + b.pending, 0),
    reservations: activeReservations(state).length,
  };
}

/** 以台账流水为准修正存档状态（存档损坏/旧版本时自愈）。 */
export function normalized(prev: DeskState): DeskState {
  const state = clone(prev);
  const slides: Record<string, SlideRuntime> = {};
  for (const def of SLIDES) {
    const derived = deriveStatus(state, def.id);
    const openLoan = state.loans.find(
      (l) => l.slideId === def.id && !l.returnedAt && !l.replacedAt
    );
    slides[def.id] = {
      status: derived,
      activeLoanId: openLoan?.id,
    };
  }
  state.slides = slides;
  state.version = 1;
  return state;
}
