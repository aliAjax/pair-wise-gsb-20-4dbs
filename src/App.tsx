import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { BOXES, SLIDES, boxName } from "./data/catalog";
import {
  boxSummaries,
  cancelReservation,
  deskCounters,
  lendReservation,
  markReplaced,
  reconcile,
  reserve,
  returnSlide,
  RuleError,
  walkInLend,
} from "./domain/rules";
import type { DeskState } from "./domain/models";
import { loadState, reloadState, resetState, saveState } from "./storage/persistence";
import { SlideCard, type ReturnInput, type Role } from "./components/SlideCard";
import { formatTime } from "./components/ui";

const nowIso = () => new Date().toISOString();

type StatusFilter = "all" | "available" | "lent" | "pending";

function App() {
  const [data, setData] = useState(() => loadState(nowIso()));
  const state = data.state;

  const [role, setRole] = useState<Role>("student");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [boxFilter, setBoxFilter] = useState<string>("all");
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  useEffect(() => {
    saveState(state);
  }, [state]);

  const run = (produce: () => DeskState, ok: string) => {
    try {
      const next = produce();
      setData({ state: next, fresh: false });
      setNotice({ kind: "ok", text: ok });
    } catch (err) {
      const text = err instanceof RuleError ? err.message : "操作失败，请重试";
      setNotice({ kind: "err", text });
    }
  };

  const counters = useMemo(() => deskCounters(state), [state]);
  const summaries = useMemo(() => boxSummaries(state), [state]);
  const check = useMemo(() => reconcile(state), [state]);

  const slides = SLIDES.filter((def) => {
    if (boxFilter !== "all" && def.boxId !== boxFilter) return false;
    if (filter !== "all" && state.slides[def.id]?.status !== filter) return false;
    return true;
  });

  const handleShiftChange = () => {
    const result = reloadState(nowIso());
    setData({ state: result.state, fresh: result.fresh });
    setNotice({
      kind: result.repaired ? "err" : "ok",
      text: result.repaired
        ? "重读存档发现状态偏差，已按借还流水自动校正"
        : "已按交接班重读存档：待检、借出、盒余量与换班前一致",
    });
  };

  const handleReset = () => {
    const next = resetState(nowIso());
    setData({ state: next, fresh: true });
    setNotice({ kind: "ok", text: "台账已清空并重新登记" });
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-06 · 玻片借还台</p>
          <h1>显微镜玻片借还登记</h1>
          <p className="subtitle">
            每张玻片登记盒位与状态；学生按课次预约，同一课次只能留一个借用人。
            归还有问题须填处理意见并转入待检，补片完成前不能再次预约。
          </p>
        </div>
        <div className="stack-card">
          <span>当前角色</span>
          <div className="role-switch" role="group" aria-label="角色切换">
            <button
              className={role === "student" ? "on" : ""}
              onClick={() => setRole("student")}
            >
              学生（预约/取消）
            </button>
            <button
              className={role === "admin" ? "on" : ""}
              onClick={() => setRole("admin")}
            >
              管理员（借出/归还/补片）
            </button>
          </div>
          <span className="muted small">最后变动：{formatTime(state.updatedAt)}</span>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>在册玻片</span>
          <strong>{counters.total}</strong>
          <i className="status-ok" />
        </article>
        <article className="metric-card">
          <span>在库余量</span>
          <strong>{counters.available}</strong>
          <i className="status-ok" />
        </article>
        <article className="metric-card">
          <span>借出中</span>
          <strong>{counters.lent}</strong>
          <i className="status-watch" />
        </article>
        <article className="metric-card">
          <span>待检（未补片）</span>
          <strong>{counters.pending}</strong>
          <i className="status-danger" />
        </article>
      </section>

      <section className="panel shift-panel">
        <div className="section-heading">
          <div>
            <p>交接班核对</p>
            <h2>整盒余量与台账对账</h2>
          </div>
          <div className="line-actions">
            <button className="primary-action" onClick={handleShiftChange}>
              换班重读存档
            </button>
            <button onClick={handleReset}>清空重新登记</button>
          </div>
        </div>
        <div className="box-grid">
          {summaries.map((b) => (
            <div key={b.boxId} className="box-card">
              <h3>{boxName(b.boxId)}</h3>
              <p className="box-count">
                余量 <strong>{b.available}</strong> / {b.total}
              </p>
              <p className="muted small">
                借出 {b.lent} · 待检 {b.pending}
              </p>
            </div>
          ))}
        </div>
        <p className={check.ok ? "reconcile-ok" : "reconcile-bad"}>
          {check.ok
            ? "✓ 对账一致：全部玻片状态与借还流水吻合，可交接班。"
            : `✗ 发现 ${check.mismatches.length} 张玻片状态与流水不符：${check.mismatches
                .map((m) => `${m.slideId}（存档 ${m.stored} → 应为 ${m.derived}）`)
                .join("，")}；重读存档可自动校正。`}
        </p>
      </section>

      {notice && (
        <div className={`notice ${notice.kind}`} role="status">
          {notice.text}
          <button onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      <section className="workspace">
        <aside className="panel narrow">
          <h2>按盒筛选</h2>
          <div className="chips">
            <button
              className={boxFilter === "all" ? "chip-on" : ""}
              onClick={() => setBoxFilter("all")}
            >
              全部盒
            </button>
            {BOXES.map((b) => (
              <button
                key={b.id}
                className={boxFilter === b.id ? "chip-on" : ""}
                onClick={() => setBoxFilter(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
          <h2>按状态筛选</h2>
          <div className="chips muted">
            {(
              [
                ["all", `全部 ${counters.total}`],
                ["available", `在库 ${counters.available}`],
                ["lent", `借出 ${counters.lent}`],
                ["pending", `待检 ${counters.pending}`],
              ] as [StatusFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? "chip-on" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <h2>规则</h2>
          <ul className="rules">
            <li>同一课次一张玻片只能留一个借用人。</li>
            <li>待检玻片补片完成前不能预约或借出。</li>
            <li>归还盒位错误或盖片破损，须写处理意见后转入待检。</li>
            <li>换班、重开页面后自动从存档恢复并对账。</li>
          </ul>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>玻片台账（{slides.length}）</p>
              <h2>借还登记</h2>
            </div>
          </div>
          <div className="slide-grid">
            {slides.map((def) => (
              <SlideCard
                key={def.id}
                slideId={def.id}
                status={state.slides[def.id].status}
                state={state}
                role={role}
                onReserve={(slideId, student, lesson) =>
                  run(() => reserve(state, { slideId, student, lesson, now: nowIso() }), "预约成功")
                }
                onCancelReservation={(id) =>
                  run(() => cancelReservation(state, id, nowIso()), "预约已取消")
                }
                onLendReservation={(id) =>
                  run(() => lendReservation(state, id, nowIso()), "已登记借出")
                }
                onWalkInLend={(slideId, student, lesson) =>
                  run(
                    () => walkInLend(state, { slideId, student, lesson, now: nowIso() }),
                    "现场借用已登记"
                  )
                }
                onReturn={(input: ReturnInput) =>
                  run(
                    () =>
                      returnSlide(state, {
                        ...input,
                        now: nowIso(),
                      }),
                    input.actualBoxId !== boxOf(input.loanId, state) || input.damaged
                      ? "已登记归还并转入待检，等待补片"
                      : "正常归还，玻片恢复在库"
                  )
                }
                onReplace={(slideId) =>
                  run(() => markReplaced(state, slideId, nowIso()), "补片完成，玻片已恢复在库")
                }
              />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function boxOf(loanId: string, state: DeskState): string | undefined {
  const loan = state.loans.find((l) => l.id === loanId);
  return loan && SLIDES.find((s) => s.id === loan.slideId)?.boxId;
}

export default App;
