import { useState } from "react";
import { BOXES, LESSONS, boxName, slideDef } from "../data/catalog";
import type { DeskState, Loan, Reservation, SlideStatus } from "../domain/models";
import { STATUS_META, formatTime } from "./ui";

export type Role = "student" | "admin";

export interface ReturnInput {
  loanId: string;
  actualBoxId: string;
  damaged: boolean;
  note: string;
}

interface SlideCardProps {
  slideId: string;
  status: SlideStatus;
  state: DeskState;
  role: Role;
  onReserve: (slideId: string, student: string, lesson: string) => void;
  onCancelReservation: (reservationId: string) => void;
  onLendReservation: (reservationId: string) => void;
  onWalkInLend: (slideId: string, student: string, lesson: string) => void;
  onReturn: (input: ReturnInput) => void;
  onReplace: (slideId: string) => void;
}

export function SlideCard(props: SlideCardProps) {
  const { slideId, status, state, role } = props;
  const def = slideDef(slideId)!;
  const meta = STATUS_META[status];

  const reservations: Reservation[] = state.reservations.filter(
    (r) => r.slideId === slideId && !r.loanId
  );
  const activeLoan = state.loans.find(
    (l) => l.slideId === slideId && !l.returnedAt && !l.replacedAt
  );
  const history = state.loans
    .filter((l) => l.slideId === slideId && (l.returnedAt || l.replacedAt))
    .slice(-3)
    .reverse();

  const [student, setStudent] = useState("");
  const [lesson, setLesson] = useState(LESSONS[0]);
  const [open, setOpen] = useState(false);

  const reservable = status === "available" && role === "student";

  return (
    <article className={`slide-card ${meta.className}`}>
      <header className="slide-head">
        <div>
          <h3>
            <span className="slide-code">{def.id}</span>
            {def.name}
          </h3>
          <p className="slide-place">
            登记盒位：{boxName(def.boxId)} · 第 {def.slot} 格 · {def.stain}
          </p>
        </div>
        <span className={`badge ${meta.className}`}>{meta.label}</span>
      </header>

      {reservations.length > 0 && (
        <div className="sub-block">
          <h4>已预约课次</h4>
          <ul className="line-list">
            {reservations.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.student}</strong> · {r.lesson}
                </span>
                <span className="line-actions">
                  {role === "admin" && status === "available" && (
                    <button
                      className="tiny primary"
                      onClick={() => props.onLendReservation(r.id)}
                    >
                      按预约借出
                    </button>
                  )}
                  {role === "student" && (
                    <button
                      className="tiny"
                      onClick={() => props.onCancelReservation(r.id)}
                    >
                      取消
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeLoan && (
        <div className="sub-block">
          <h4>当前借出</h4>
          <p className="loan-line">
            <strong>{activeLoan.student}</strong> · {activeLoan.lesson} · 借出于{" "}
            {formatTime(activeLoan.lentAt)}
          </p>
          {role === "admin" && (
            <ReturnForm
              loanId={activeLoan.id}
              registeredBoxId={def.boxId}
              onReturn={props.onReturn}
            />
          )}
        </div>
      )}

      {status === "pending" && (
        <div className="sub-block">
          {history[0] && (
            <>
              <h4>待检处理意见</h4>
              <p className="note-text">
                {history[0].damaged && <em className="tag-danger">盖片破损</em>}
                {history[0].positionWrong && (
                  <em className="tag-warn">归还位置错误</em>
                )}
                {history[0].note}
              </p>
              <p className="muted small">
                实际归还：
                {history[0].actualBoxId
                  ? boxName(history[0].actualBoxId)
                  : "—"}
                {history[0].replacedAt
                  ? ` · 补片完成 ${formatTime(history[0].replacedAt)}`
                  : " · 补片完成前不可预约"}
              </p>
            </>
          )}
          {role === "admin" && !history[0]?.replacedAt && (
            <button className="primary-action" onClick={() => props.onReplace(slideId)}>
              补片完成，恢复在库
            </button>
          )}
        </div>
      )}

      {role === "student" && status === "available" && (
        <div className="sub-block">
          <h4>学生预约</h4>
          <div className="form-row">
            <input
              value={student}
              placeholder="借用人姓名"
              onChange={(e) => setStudent(e.target.value)}
            />
            <input
              list="lesson-options"
              value={lesson}
              placeholder="选择或填写课次"
              onChange={(e) => setLesson(e.target.value)}
            />
            <button
              className="primary-action"
              disabled={!reservable}
              onClick={() => props.onReserve(slideId, student, lesson)}
            >
              预约本课次
            </button>
          </div>
        </div>
      )}

      {role === "admin" && status === "available" && (
        <div className="sub-block">
          <button onClick={() => setOpen((v) => !v)}>
            {open ? "收起现场登记" : "未预约现场借用"}
          </button>
          {open && (
            <div className="form-row">
              <input
                value={student}
                placeholder="借用人姓名"
                onChange={(e) => setStudent(e.target.value)}
              />
              <input
                list="lesson-options"
                value={lesson}
                placeholder="选择或填写课次"
                onChange={(e) => setLesson(e.target.value)}
              />
              <button
                className="primary-action"
                onClick={() => props.onWalkInLend(slideId, student, lesson)}
              >
                登记借出
              </button>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <details className="history">
          <summary>最近归还记录（{history.length}）</summary>
          <ul className="line-list">
            {history.map((l) => (
              <li key={l.id}>
                <span>
                  {l.student} · {l.lesson}
                  {l.positionWrong && <em className="tag-warn"> 位置错</em>}
                  {l.damaged && <em className="tag-danger"> 破损</em>}
                  {l.replacedAt ? " · 已补片" : l.inspectedAt ? " · 待检" : " · 正常归还"}
                </span>
                <span className="muted small">{formatTime(l.returnedAt ?? "")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <datalist id="lesson-options">
        {LESSONS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </article>
  );
}

function ReturnForm({
  loanId,
  registeredBoxId,
  onReturn,
}: {
  loanId: string;
  registeredBoxId: string;
  onReturn: (input: ReturnInput) => void;
}) {
  const [boxId, setBoxId] = useState(registeredBoxId);
  const [damaged, setDamaged] = useState(false);
  const [note, setNote] = useState("");

  const positionWrong = boxId !== registeredBoxId;
  const needsInspection = positionWrong || damaged;

  return (
    <div className="return-form">
      <div className="form-row">
        <label className="select-label">
          归还盒位
          <select value={boxId} onChange={(e) => setBoxId(e.target.value)}>
            {BOXES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={damaged}
            onChange={(e) => setDamaged(e.target.checked)}
          />
          盖片破损
        </label>
      </div>
      {positionWrong && <p className="warn-text">归还盒位与登记盒位不一致</p>}
      {needsInspection && (
        <textarea
          value={note}
          placeholder="管理员处理意见（位置错放或破损时必填，提交后转入待检）"
          rows={2}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      <button
        className="primary-action"
        onClick={() => onReturn({ loanId, actualBoxId: boxId, damaged, note })}
      >
        {needsInspection ? "填写意见并转入待检" : "正常归还，恢复在库"}
      </button>
    </div>
  );
}
