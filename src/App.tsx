// 页面：借还台界面。资料来自 data.ts，判断交给 logic.ts，保存交给 storage.ts。
import { useEffect, useState, type FormEvent } from "react";
import "./styles.css";
import {
  BOXES,
  SESSIONS,
  STATUS_LABEL,
  REASON_LABEL,
  boxLabel,
  sessionLabel,
  type DeskState,
  type Slide,
} from "./data";
import {
  boxRemaining,
  cancelReservation,
  checkout,
  countByStatus,
  reserve,
  resolveInspection,
  returnSlide,
  type OpResult,
} from "./logic";
import { loadState, resetState, saveState } from "./storage";

type Notice = { kind: "ok" | "err"; text: string } | null;

interface ReturnDraft {
  slideId: string;
  actualBoxId: string;
  coverDamaged: boolean;
  note: string;
}

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

function App() {
  const [state, setState] = useState<DeskState>(() => loadState());
  const [notice, setNotice] = useState<Notice>(null);
  const [form, setForm] = useState({ slideId: "", sessionId: SESSIONS[0].id, student: "" });
  const [returning, setReturning] = useState<ReturnDraft | null>(null);

  // 每次台账变化即落盘，换班、重开页面后数据不丢
  useEffect(() => {
    saveState(state);
  }, [state]);

  const run = (result: OpResult) => {
    if (result.ok) {
      setState(result.state);
      setNotice({ kind: "ok", text: result.message });
    } else {
      setNotice({ kind: "err", text: result.error });
    }
  };

  const handleReserve = (e: FormEvent) => {
    e.preventDefault();
    if (!form.slideId) {
      setNotice({ kind: "err", text: "请选择要预约的玻片" });
      return;
    }
    const result = reserve(state, form.slideId, form.sessionId, form.student);
    run(result);
    if (result.ok) setForm({ ...form, student: "" });
  };

  const openReturn = (slide: Slide) => {
    setReturning({
      slideId: slide.id,
      actualBoxId: slide.homeBoxId,
      coverDamaged: false,
      note: "",
    });
  };

  const handleReturnConfirm = () => {
    if (!returning) return;
    const result = returnSlide(
      state,
      returning.slideId,
      returning.actualBoxId,
      returning.coverDamaged,
      returning.note
    );
    run(result);
    if (result.ok) setReturning(null);
  };

  const handleReset = () => {
    if (!window.confirm("确定要清空当前台账并恢复初始数据吗？")) return;
    setState(resetState());
    setReturning(null);
    setNotice({ kind: "ok", text: "已恢复初始台账" });
  };

  const available = countByStatus(state, "available");
  const lent = countByStatus(state, "lent");
  const inspecting = countByStatus(state, "inspecting");

  const returningSlide = returning
    ? state.slides.find((s) => s.id === returning.slideId)
    : undefined;
  const returnAbnormal =
    !!returning &&
    !!returningSlide &&
    (returning.actualBoxId !== returningSlide.homeBoxId || returning.coverDamaged);

  const pendingInspections = state.inspections.filter((i) => !i.resolvedAt);
  const resolvedInspections = state.inspections.filter((i) => i.resolvedAt);

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-06 · 实验管理员值勤</p>
          <h1>显微镜玻片借还台</h1>
          <p className="subtitle">
            每张玻片登记盒位与状态；学生按课次预约，同一课次只留一个借用人；归还位置错误或盖片破损时，
            管理员填写处理意见后转入待检，补片完成前不能再预约。台账保存在本机浏览器，换班、重开页面不丢。
          </p>
        </div>
        <div className="stack-card">
          <span>当前台面</span>
          <strong>
            借出 {lent} · 待检 {inspecting} · 待取 {state.reservations.length}
          </strong>
          <button onClick={handleReset}>重置台账</button>
        </div>
      </section>

      {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}

      <section className="metrics-grid">
        <article className="metric-card">
          <span>在盒可约</span>
          <strong>{available}</strong>
          <i className="status-ok" />
        </article>
        <article className="metric-card">
          <span>借出中</span>
          <strong>{lent}</strong>
          <i className="status-watch" />
        </article>
        <article className="metric-card">
          <span>待检</span>
          <strong>{inspecting}</strong>
          <i className="status-danger" />
        </article>
        <article className="metric-card">
          <span>预约待取</span>
          <strong>{state.reservations.length}</strong>
          <i className="status-ok" />
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>整盒余量</p>
            <h2>盒位余量</h2>
          </div>
        </div>
        <div className="box-grid">
          {BOXES.map((box) => {
            const remaining = boxRemaining(state, box.id);
            const inBox = box.capacity - remaining;
            const pct = box.capacity === 0 ? 0 : Math.round((inBox / box.capacity) * 100);
            return (
              <div className="box-card" key={box.id}>
                <div className="box-head">
                  <strong>{box.name}</strong>
                  <span>{box.theme}</span>
                </div>
                <p>
                  在盒 {inBox} / {box.capacity} · 余量 {remaining}
                </p>
                <div className="box-bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>预约登记</h2>
          <form onSubmit={handleReserve}>
            <label>
              <span>玻片</span>
              <select
                value={form.slideId}
                onChange={(e) => setForm({ ...form, slideId: e.target.value })}
              >
                <option value="">请选择玻片</option>
                {state.slides.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.status === "inspecting"}>
                    {s.id} · {s.name}（{boxLabel(s.homeBoxId)}
                    {s.slot}位 · {STATUS_LABEL[s.status]}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>课次</span>
              <select
                value={form.sessionId}
                onChange={(e) => setForm({ ...form, sessionId: e.target.value })}
              >
                {SESSIONS.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>借用人</span>
              <input
                value={form.student}
                onChange={(e) => setForm({ ...form, student: e.target.value })}
                placeholder="学生姓名"
              />
            </label>
            <button className="primary-action" type="submit">
              登记预约
            </button>
          </form>

          <h2>课次安排</h2>
          {SESSIONS.map((session) => {
            const reservations = state.reservations.filter((r) => r.sessionId === session.id);
            const loans = state.loans.filter((l) => l.sessionId === session.id);
            return (
              <div className="session-block" key={session.id}>
                <h3>{session.label}</h3>
                {reservations.length + loans.length === 0 && <p className="empty">暂无预约</p>}
                {reservations.map((r) => {
                  const slide = state.slides.find((s) => s.id === r.slideId);
                  return (
                    <div className="entry" key={r.id}>
                      <span>
                        {slide?.name} · {r.student}（已约）
                      </span>
                      <span className="entry-actions">
                        <button onClick={() => run(checkout(state, r.id))}>取片</button>
                        <button onClick={() => run(cancelReservation(state, r.id))}>取消</button>
                      </span>
                    </div>
                  );
                })}
                {loans.map((l) => {
                  const slide = state.slides.find((s) => s.id === l.slideId);
                  return (
                    <div className="entry" key={l.id}>
                      <span>
                        {slide?.name} · {l.student}（借出）
                      </span>
                      <span className="entry-actions">
                        <button onClick={() => slide && openReturn(slide)}>归还</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>盒位与状态</p>
              <h2>玻片台账</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>玻片</th>
                  <th>登记盒位</th>
                  <th>状态</th>
                  <th>当次借用</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {state.slides.map((slide) => {
                  const loan = state.loans.find((l) => l.slideId === slide.id);
                  const reservedCount = state.reservations.filter(
                    (r) => r.slideId === slide.id
                  ).length;
                  return (
                    <tr key={slide.id}>
                      <td>{slide.id}</td>
                      <td>{slide.name}</td>
                      <td>
                        {boxLabel(slide.homeBoxId)} · {slide.slot} 位
                      </td>
                      <td>
                        <span className={`badge ${slide.status}`}>
                          {STATUS_LABEL[slide.status]}
                        </span>
                      </td>
                      <td>
                        {loan
                          ? `${loan.student} · ${sessionLabel(loan.sessionId)}`
                          : reservedCount > 0
                            ? `${reservedCount} 个课次已约`
                            : "—"}
                      </td>
                      <td>
                        {slide.status === "lent" ? (
                          <button onClick={() => openReturn(slide)}>归还登记</button>
                        ) : slide.status === "inspecting" ? (
                          <span className="empty">待检中</span>
                        ) : (
                          <span className="empty">在盒</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {returning && returningSlide && (
        <section className="panel return-panel">
          <div className="section-heading">
            <div>
              <p>归还登记</p>
              <h2>
                {returningSlide.id} · {returningSlide.name}
              </h2>
            </div>
            <button onClick={() => setReturning(null)}>取消</button>
          </div>
          <p className="hint">
            登记盒位：{boxLabel(returningSlide.homeBoxId)} · {returningSlide.slot} 位。
            归还位置错误或盖片破损时，须填写处理意见并转入待检，补片完成前不能再预约。
          </p>
          <div className="return-grid">
            <label>
              <span>实际归还盒位</span>
              <select
                value={returning.actualBoxId}
                onChange={(e) => setReturning({ ...returning, actualBoxId: e.target.value })}
              >
                {BOXES.map((box) => (
                  <option key={box.id} value={box.id}>
                    {box.name}（{box.theme}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>盖片状态</span>
              <span className="check-line">
                <input
                  type="checkbox"
                  checked={!returning.coverDamaged}
                  onChange={(e) => setReturning({ ...returning, coverDamaged: !e.target.checked })}
                />
                盖片完好
              </span>
            </label>
          </div>
          <label>
            <span>处理意见{returnAbnormal ? "（异常必填）" : "（正常归还无需填写）"}</span>
            <textarea
              value={returning.note}
              onChange={(e) => setReturning({ ...returning, note: e.target.value })}
              placeholder="如：应还 A 盒实还 B 盒，已取回待检盘；盖片裂痕，已申领补片"
            />
          </label>
          <div className="actions-row">
            <button className="primary-action" onClick={handleReturnConfirm}>
              确认归还
            </button>
            {returnAbnormal && <span className="warn-text">将转入待检，补片完成前不可预约</span>}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>异常处理</p>
            <h2>待检与补片</h2>
          </div>
        </div>
        {pendingInspections.length === 0 && <p className="empty">当前没有待检玻片</p>}
        <div className="inspection-list">
          {pendingInspections.map((inspection) => {
            const slide = state.slides.find((s) => s.id === inspection.slideId);
            return (
              <article className="inspection-card" key={inspection.id}>
                <div className="inspection-head">
                  <strong>
                    {slide?.id} · {slide?.name}
                  </strong>
                  <span className="badge inspecting">待检</span>
                </div>
                <p>
                  {inspection.reasons.map((r) => REASON_LABEL[r]).join("；")}（{inspection.detail}）
                </p>
                <p>处理意见:{inspection.note}</p>
                <p className="empty">登记于 {fmtTime(inspection.createdAt)}</p>
                <div>
                  <button
                    className="primary-action"
                    onClick={() => run(resolveInspection(state, inspection.id))}
                  >
                    补片完成，恢复可约
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {resolvedInspections.length > 0 && (
          <>
            <h3 className="history-title">处理历史</h3>
            <div className="inspection-list">
              {resolvedInspections.map((inspection) => {
                const slide = state.slides.find((s) => s.id === inspection.slideId);
                return (
                  <article className="inspection-card resolved" key={inspection.id}>
                    <div className="inspection-head">
                      <strong>
                        {slide?.id} · {slide?.name}
                      </strong>
                      <span className="badge available">已完成</span>
                    </div>
                    <p>
                      {inspection.reasons.map((r) => REASON_LABEL[r]).join("；")}（
                      {inspection.detail}）· 处理意见:{inspection.note}
                    </p>
                    <p className="empty">补片完成于 {fmtTime(inspection.resolvedAt!)}</p>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
