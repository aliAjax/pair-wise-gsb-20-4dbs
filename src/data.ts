// 资料：类型定义、盒位与课次等基础数据、初始台账
// 本文件只放数据与常量，不写业务判断，也不做保存。

export type SlideStatus = "available" | "lent" | "inspecting";

export interface BoxDef {
  id: string;
  name: string;
  theme: string;
  capacity: number;
}

export interface SessionDef {
  id: string;
  label: string;
}

export interface Slide {
  id: string;
  name: string;
  homeBoxId: string; // 登记盒位
  slot: number; // 盒内位置
  status: SlideStatus;
  coverDamaged: boolean; // 盖片是否破损
}

export interface Reservation {
  id: string;
  slideId: string;
  sessionId: string;
  student: string;
  createdAt: string;
}

export interface Loan {
  id: string;
  slideId: string;
  sessionId: string;
  student: string;
  borrowedAt: string;
}

export type InspectionReason = "wrong-box" | "cover-damaged";

export interface Inspection {
  id: string;
  slideId: string;
  reasons: InspectionReason[];
  detail: string;
  note: string; // 管理员处理意见
  createdAt: string;
  resolvedAt: string | null; // 补片完成时间，null 表示仍在待检
}

export interface DeskState {
  slides: Slide[];
  reservations: Reservation[];
  loans: Loan[];
  inspections: Inspection[];
}

export const STATUS_LABEL: Record<SlideStatus, string> = {
  available: "在盒可约",
  lent: "借出中",
  inspecting: "待检",
};

export const REASON_LABEL: Record<InspectionReason, string> = {
  "wrong-box": "归还位置错误",
  "cover-damaged": "盖片破损",
};

export const BOXES: BoxDef[] = [
  { id: "A", name: "A 盒", theme: "植物组织", capacity: 6 },
  { id: "B", name: "B 盒", theme: "动物与血液", capacity: 6 },
  { id: "C", name: "C 盒", theme: "微生物", capacity: 4 },
];

export const SESSIONS: SessionDef[] = [
  { id: "mon34", label: "周一 3-4 节" },
  { id: "mon78", label: "周一 7-8 节" },
  { id: "tue34", label: "周二 3-4 节" },
  { id: "wed56", label: "周三 5-6 节" },
  { id: "fri12", label: "周五 1-2 节" },
];

export function boxLabel(boxId: string): string {
  const box = BOXES.find((b) => b.id === boxId);
  return box ? box.name : boxId;
}

export function sessionLabel(sessionId: string): string {
  const session = SESSIONS.find((s) => s.id === sessionId);
  return session ? session.label : sessionId;
}

// 初始台账：含一笔借出、一条预约、一条待检，方便换班时直接看到各状态
export function seedState(): DeskState {
  const now = new Date().toISOString();
  return {
    slides: [
      { id: "S-01", name: "洋葱表皮", homeBoxId: "A", slot: 1, status: "available", coverDamaged: false },
      { id: "S-02", name: "蚕豆根尖", homeBoxId: "A", slot: 2, status: "available", coverDamaged: false },
      { id: "S-03", name: "叶片横切", homeBoxId: "A", slot: 3, status: "available", coverDamaged: false },
      { id: "S-04", name: "花粉粒", homeBoxId: "A", slot: 4, status: "available", coverDamaged: false },
      { id: "S-05", name: "人血涂片", homeBoxId: "B", slot: 1, status: "lent", coverDamaged: false },
      { id: "S-06", name: "口腔上皮", homeBoxId: "B", slot: 2, status: "available", coverDamaged: false },
      { id: "S-07", name: "蛙血涂片", homeBoxId: "B", slot: 3, status: "available", coverDamaged: false },
      { id: "S-08", name: "草履虫", homeBoxId: "C", slot: 1, status: "inspecting", coverDamaged: true },
      { id: "S-09", name: "酵母菌", homeBoxId: "C", slot: 2, status: "available", coverDamaged: false },
      { id: "S-10", name: "水绵", homeBoxId: "C", slot: 3, status: "available", coverDamaged: false },
    ],
    reservations: [
      { id: "R-seed-1", slideId: "S-01", sessionId: "tue34", student: "王雨桐", createdAt: now },
    ],
    loans: [
      { id: "L-seed-1", slideId: "S-05", sessionId: "mon34", student: "李明轩", borrowedAt: now },
    ],
    inspections: [
      {
        id: "I-seed-1",
        slideId: "S-08",
        reasons: ["cover-damaged"],
        detail: "盖片破损",
        note: "盖片右下角裂痕，已申领新盖片，补片后复检。",
        createdAt: now,
        resolvedAt: null,
      },
    ],
  };
}
