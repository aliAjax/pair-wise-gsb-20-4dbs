// 借还台领域模型：只描述数据形状，不放任何业务判断。

export type SlideStatus = "available" | "lent" | "pending";

/** 玻片资料（静态登记信息，来自资料层） */
export interface SlideDef {
  id: string;
  /** 标本名称 */
  name: string;
  /** 染色/制片方式 */
  stain: string;
  /** 登记盒位（盒编号） */
  boxId: string;
  /** 盒内格号 */
  slot: string;
}

/** 玻片盒 */
export interface BoxDef {
  id: string;
  name: string;
}

/** 学生按课次提出的预约 */
export interface Reservation {
  id: string;
  slideId: string;
  /** 借用人（学生） */
  student: string;
  /** 课次，如“第4周 周三 第3-4节” */
  lesson: string;
  createdAt: string;
  /** 预约转借出后对应的台账记录 */
  loanId?: string;
}

/** 借出/归还台账记录 */
export interface Loan {
  id: string;
  slideId: string;
  student: string;
  lesson: string;
  lentAt: string;
  returnedAt?: string;
  /** 实际归还到的盒位 */
  actualBoxId?: string;
  /** 实际归还盒位与登记盒位是否不一致 */
  positionWrong?: boolean;
  /** 盖片是否破损 */
  damaged?: boolean;
  /** 管理员填写的处理意见（转入待检时必填） */
  note?: string;
  /** 转入待检时间 */
  inspectedAt?: string;
  /** 补片完成时间；未补片前不得再次预约 */
  replacedAt?: string;
}

/** 单张玻片的运行时状态 */
export interface SlideRuntime {
  status: SlideStatus;
  /** 当前未归还台账记录的编号 */
  activeLoanId?: string;
}

/** 借还台完整存档 */
export interface DeskState {
  version: 1;
  updatedAt: string;
  slides: Record<string, SlideRuntime>;
  reservations: Reservation[];
  loans: Loan[];
}
