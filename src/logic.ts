// 判断：借还台全部业务规则，均为纯函数，输入旧台账返回新台账。
// 不读写 localStorage，也不依赖 React，方便单独核对规则。

import {
  BOXES,
  boxLabel,
  type DeskState,
  type Inspection,
  type InspectionReason,
  type Loan,
  type Reservation,
  type Slide,
} from "./data";

export type OpResult =
  | { ok: true; state: DeskState; message: string }
  | { ok: false; error: string };

const ok = (state: DeskState, message: string): OpResult => ({ ok: true, state, message });
const err = (error: string): OpResult => ({ ok: false, error });

const nowIso = () => new Date().toISOString();
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;

export function findSlide(state: DeskState, slideId: string): Slide | undefined {
  return state.slides.find((s) => s.id === slideId);
}

export function loanOf(state: DeskState, slideId: string): Loan | undefined {
  return state.loans.find((l) => l.slideId === slideId);
}

export function reservationsOf(state: DeskState, slideId: string): Reservation[] {
  return state.reservations.filter((r) => r.slideId === slideId);
}

// 预约校验：返回 null 表示可约，否则返回原因
export function canReserve(
  state: DeskState,
  slideId: string,
  sessionId: string,
  student: string
): string | null {
  const slide = findSlide(state, slideId);
  if (!slide) return "玻片不存在";
  if (!student.trim()) return "请填写借用人姓名";
  if (slide.status === "inspecting") return "该玻片待检中，补片完成前不能预约";
  if (state.reservations.some((r) => r.slideId === slideId && r.sessionId === sessionId)) {
    return "该课次已有人预约，同一课次只能留一个借用人";
  }
  if (state.loans.some((l) => l.slideId === slideId && l.sessionId === sessionId)) {
    return "该课次已有人借用，同一课次只能留一个借用人";
  }
  return null;
}

export function reserve(
  state: DeskState,
  slideId: string,
  sessionId: string,
  student: string
): OpResult {
  const problem = canReserve(state, slideId, sessionId, student);
  if (problem) return err(problem);
  const slide = findSlide(state, slideId)!;
  const reservation: Reservation = {
    id: nextId("R"),
    slideId,
    sessionId,
    student: student.trim(),
    createdAt: nowIso(),
  };
  return ok(
    { ...state, reservations: [...state.reservations, reservation] },
    `${slide.name} 已预约给 ${reservation.student}`
  );
}

export function cancelReservation(state: DeskState, reservationId: string): OpResult {
  const target = state.reservations.find((r) => r.id === reservationId);
  if (!target) return err("预约不存在或已取消");
  return ok(
    { ...state, reservations: state.reservations.filter((r) => r.id !== reservationId) },
    "已取消预约"
  );
}

// 取片：预约转为借出，玻片必须仍在盒中
export function checkout(state: DeskState, reservationId: string): OpResult {
  const reservation = state.reservations.find((r) => r.id === reservationId);
  if (!reservation) return err("预约不存在");
  const slide = findSlide(state, reservation.slideId);
  if (!slide) return err("玻片不存在");
  if (slide.status === "inspecting") return err("该玻片待检中，不能取片");
  if (slide.status === "lent") return err("玻片借出中，归还后才能取片");
  const loan: Loan = {
    id: nextId("L"),
    slideId: reservation.slideId,
    sessionId: reservation.sessionId,
    student: reservation.student,
    borrowedAt: nowIso(),
  };
  const slides = state.slides.map((s) =>
    s.id === slide.id ? { ...s, status: "lent" as const } : s
  );
  return ok(
    {
      ...state,
      slides,
      loans: [...state.loans, loan],
      reservations: state.reservations.filter((r) => r.id !== reservationId),
    },
    `${slide.name} 已借出给 ${loan.student}`
  );
}

// 归还：位置错或盖片破损即异常，须填处理意见并转入待检
export function returnSlide(
  state: DeskState,
  slideId: string,
  actualBoxId: string,
  coverDamaged: boolean,
  note: string
): OpResult {
  const slide = findSlide(state, slideId);
  if (!slide) return err("玻片不存在");
  if (!loanOf(state, slideId)) return err("该玻片没有借出记录");

  const wrongBox = actualBoxId !== slide.homeBoxId;
  const abnormal = wrongBox || coverDamaged;
  const comment = note.trim();
  if (abnormal && !comment) return err("归还异常，管理员需填写处理意见后转入待检");

  const loans = state.loans.filter((l) => l.slideId !== slideId);

  if (!abnormal) {
    const slides = state.slides.map((s) =>
      s.id === slideId ? { ...s, status: "available" as const } : s
    );
    return ok(
      { ...state, slides, loans },
      `${slide.name} 已归还 ${boxLabel(slide.homeBoxId)} ${slide.slot} 位`
    );
  }

  const reasons: InspectionReason[] = [];
  const details: string[] = [];
  if (wrongBox) {
    reasons.push("wrong-box");
    details.push(`应还${boxLabel(slide.homeBoxId)}，实还${boxLabel(actualBoxId)}`);
  }
  if (coverDamaged) {
    reasons.push("cover-damaged");
    details.push("盖片破损");
  }
  const inspection: Inspection = {
    id: nextId("I"),
    slideId,
    reasons,
    detail: details.join("；"),
    note: comment,
    createdAt: nowIso(),
    resolvedAt: null,
  };
  const slides = state.slides.map((s) =>
    s.id === slideId
      ? { ...s, status: "inspecting" as const, coverDamaged: coverDamaged || s.coverDamaged }
      : s
  );
  return ok(
    { ...state, slides, loans, inspections: [inspection, ...state.inspections] },
    `${slide.name} 已转入待检，补片完成前不能预约`
  );
}

// 补片完成：待检关闭，玻片恢复在盒可约
export function resolveInspection(state: DeskState, inspectionId: string): OpResult {
  const inspection = state.inspections.find((i) => i.id === inspectionId);
  if (!inspection) return err("待检记录不存在");
  if (inspection.resolvedAt) return err("该记录已处理完成");
  const slide = findSlide(state, inspection.slideId);
  if (!slide) return err("玻片不存在");
  const inspections = state.inspections.map((i) =>
    i.id === inspectionId ? { ...i, resolvedAt: nowIso() } : i
  );
  const slides = state.slides.map((s) =>
    s.id === slide.id ? { ...s, status: "available" as const, coverDamaged: false } : s
  );
  return ok({ ...state, slides, inspections }, `${slide.name} 补片完成，已恢复可约`);
}

// 整盒余量：容量减去当前在盒（在盒可约）的玻片数，借出与待检均不占盒位
export function boxRemaining(state: DeskState, boxId: string): number {
  const box = BOXES.find((b) => b.id === boxId);
  if (!box) return 0;
  const inBox = state.slides.filter(
    (s) => s.homeBoxId === boxId && s.status === "available"
  ).length;
  return box.capacity - inBox;
}

export function countByStatus(state: DeskState, status: Slide["status"]): number {
  return state.slides.filter((s) => s.status === status).length;
}
