import {
  createInitialState,
  reserve,
  lendReservation,
  walkInLend,
  returnSlide,
  markReplaced,
  cancelReservation,
  boxSummaries,
  reconcile,
  deskCounters,
  activeReservations,
  RuleError,
} from "../src/domain/rules";
import type { DeskState } from "../src/domain/models";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name} ${detail}`);
  }
}
function expectError(name: string, fn: () => unknown, fragment: string) {
  try {
    fn();
    fail++;
    console.error(`FAIL: ${name} (应抛出含“${fragment}”的错误)`);
  } catch (e) {
    if (e instanceof RuleError && e.message.includes(fragment)) pass++;
    else {
      fail++;
      console.error(`FAIL: ${name} 错误信息不对: ${(e as Error).message}`);
    }
  }
}

const t = (m: string) => `2026-09-24T${m}`;

// 1. 初始：全部在库，余量=总数，对账一致
let s: DeskState = createInitialState(t("08:00:00.000Z"));
let c = deskCounters(s);
check("初始在库=10", c.available === 10 && c.lent === 0 && c.pending === 0);
check("初始对账一致", reconcile(s).ok);

// 2. 学生预约同一课次
s = reserve(s, { slideId: "A-01", student: "张三", lesson: "L1", now: t("08:05:00.000Z") });
check("预约数=1", activeReservations(s).length === 1);
expectError(
  "同一课次第二个借用人被拒",
  () => reserve(s, { slideId: "A-01", student: "李四", lesson: "L1", now: t("08:06:00.000Z") }),
  "该课次"
);
// 不同课次可约
s = reserve(s, { slideId: "A-01", student: "李四", lesson: "L2", now: t("08:07:00.000Z") });
check("不同课次可约", activeReservations(s).length === 2);

// 3. 预约转借出后该课次占用，别的课次仍可约
const r1 = s.reservations.find((r) => r.student === "张三")!.id;
s = lendReservation(s, r1, t("09:00:00.000Z"));
check("借出后在库-1", deskCounters(s).lent === 1 && deskCounters(s).available === 9);
expectError(
  "已借课次不能再现场借",
  () => walkInLend(s, { slideId: "A-01", student: "王五", lesson: "L1", now: t("09:01:00.000Z") }),
  "已借出"
);
// 待检/借出时不能预约该玻片
expectError(
  "借出中不能预约",
  () => reserve(s, { slideId: "A-01", student: "王五", lesson: "L9", now: t("09:02:00.000Z") }),
  "已借出"
);

// 4. 正常归还
const loanA01 = s.loans.find((l) => l.slideId === "A-01")!.id;
s = returnSlide(s, { loanId: loanA01, actualBoxId: "A", damaged: false, note: "", now: t("10:00:00.000Z") });
check("正常归还恢复在库", deskCounters(s).available === 10 && deskCounters(s).lent === 0);
check("归还后对账一致", reconcile(s).ok);

// 5. 位置错放 → 必须填意见 → 待检
s = walkInLend(s, { slideId: "B-02", student: "赵六", lesson: "L3", now: t("10:10:00.000Z") });
const loanB02 = s.loans.find((l) => l.slideId === "B-02" && !l.returnedAt)!.id;
expectError(
  "位置错放不填意见被拒",
  () => returnSlide(s, { loanId: loanB02, actualBoxId: "C", damaged: false, note: "  ", now: t("11:00:00.000Z") }),
  "处理意见"
);
s = returnSlide(s, { loanId: loanB02, actualBoxId: "C", damaged: false, note: "错放入C盒，已登记待检", now: t("11:05:00.000Z") });
check("错放后待检+1", deskCounters(s).pending === 1 && deskCounters(s).available === 9);
check("待检状态", s.slides["B-02"].status === "pending");
expectError(
  "待检不能预约",
  () => reserve(s, { slideId: "B-02", student: "钱七", lesson: "L4", now: t("11:10:00.000Z") }),
  "待检"
);
expectError(
  "待检不能现场借",
  () => walkInLend(s, { slideId: "B-02", student: "钱七", lesson: "L4", now: t("11:11:00.000Z") }),
  "待检"
);

// 6. 盖片破损同路径
s = walkInLend(s, { slideId: "C-01", student: "孙八", lesson: "L5", now: t("13:00:00.000Z") });
const loanC01 = s.loans.find((l) => l.slideId === "C-01" && !l.returnedAt)!.id;
expectError(
  "破损不填意见被拒",
  () => returnSlide(s, { loanId: loanC01, actualBoxId: "C", damaged: true, note: "", now: t("14:00:00.000Z") }),
  "处理意见"
);
s = returnSlide(s, { loanId: loanC01, actualBoxId: "C", damaged: true, note: "盖片碎裂，补片", now: t("14:05:00.000Z") });
check("破损也进待检", deskCounters(s).pending === 2);

// 7. 补片完成 → 恢复可约；未补片的另一张仍锁
s = markReplaced(s, "B-02", t("15:00:00.000Z"));
check("补片后待检-1在库+1", deskCounters(s).pending === 1 && deskCounters(s).available === 9);
s = reserve(s, { slideId: "B-02", student: "钱七", lesson: "L4", now: t("15:10:00.000Z") });
check("补片后可重新预约", activeReservations(s).some((r) => r.slideId === "B-02"));
check("未补片的C-01仍待检", s.slides["C-01"].status === "pending");

// 8. 整盒余量
const boxes = Object.fromEntries(boxSummaries(s).map((b) => [b.boxId, b]));
check("B盒余量2(借0待检0)", boxes.B.total === 3 && boxes.B.available === 3 && boxes.B.lent === 0 && boxes.B.pending === 0);
check("C盒余量3待检1", boxes.C.available === 3 && boxes.C.pending === 1 && boxes.C.total === 4);
check("全程对账一致", reconcile(s).ok);

// 9. 取消预约
const beforeCount = activeReservations(s).length;
const rB02 = s.reservations.find((r) => r.slideId === "B-02" && !r.loanId)!.id;
s = cancelReservation(s, rB02, t("15:20:00.000Z"));
check("取消后预约-1", activeReservations(s).length === beforeCount - 1);
// 取消后该课次可再约
s = reserve(s, { slideId: "B-02", student: "新同学", lesson: "L4", now: t("15:25:00.000Z") });
check("取消后课次可再约", activeReservations(s).some((r) => r.student === "新同学"));

// 10. 已转借出的预约不能取消
const lentRes = s.reservations.find((r) => r.loanId)!;
expectError("已借出预约不能取消", () => cancelReservation(s, lentRes.id, t("15:30:00.000Z")), "已经借出");

// 11. 重开页面模拟：序列化→normalized 后对账一致（在 persistence.loadState 内部调用）
const json = JSON.parse(JSON.stringify(s)) as DeskState;
// 人为篡改一张状态，normalized 应自愈
json.slides["A-02"].status = "lent";
check("篡改后对账失败", !reconcile(json).ok);
// 直接再走一次 reserve 前由 loadState 做 normalized；此处引入 normalized 验证
const { normalized } = await import("../src/domain/rules");
const healed = normalized(json);
check("自愈后对账一致", reconcile(healed).ok);
check("自愈为真实在库", healed.slides["A-02"].status === "available");

// 12. 待检流水未补片：即使再次归还其他记录也不影响
check("最终待检=1(C-01)", deskCounters(s).pending === 1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
