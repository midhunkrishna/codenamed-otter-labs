import { useMemo, useState } from "react";
import type {
  FormCommentAnswers,
  FormCommentCardProps,
  FormCommentQuestion,
  FormCommentState,
} from "./types";
import { Pill } from "./Pill";
import { Button } from "./Button";
import * as css from "./FormCommentCard.css";

const STATE_LABEL: Record<FormCommentState, string> = {
  open: "Open",
  submitted: "Submitted",
  dismissed: "Dismissed",
  expired: "Expired",
  superseded: "Superseded",
};

/**
 * Agent-asks form comment (OTR-101 / plan 008 §1.5).
 *
 * Outer: teal diamond avatar · agent name · amber "POSTED A FORM" pill ·
 * `· <phase> · <time>` meta · right-aligned status pill (amber when open).
 * Inner: subtle warning-bordered card with a `📋 Form · <phase>` header and a
 * red "BLOCKS TICKET" pill (only while blocking & open); one row per question
 * (radio / checkbox / boolean / text / textarea); footer helper + an indigo
 * "Submit answers" button disabled until every required question is answered.
 *
 * When `questions` is omitted the card falls back to the legacy
 * `children`/`footer` slots (preview + other call sites).
 */
export function FormCommentCard({
  author,
  state,
  blocking,
  phase,
  prose,
  time,
  questions,
  onSubmit,
  submitting,
  children,
  footer,
  className,
}: FormCommentCardProps) {
  const open = state === "open";
  const showBlocking = Boolean(blocking) && open;
  const interactive = open && questions !== undefined && questions.length > 0;

  return (
    <div
      className={[css.root, open ? "" : css.resolved, className]
        .filter(Boolean)
        .join(" ")}
      data-form-state={state}
      data-blocking={showBlocking ? "true" : undefined}
    >
      <div className={css.head}>
        <span className={css.avatar} aria-hidden="true" />
        <span className={css.author}>{author}</span>
        <Pill tone="status.needs_user_approval">Posted a form</Pill>
        <span className={css.meta}>
          {phase ? <>· {phase} </> : null}
          {time ? <>· {time}</> : null}
        </span>
        <span className={css.statusPill}>
          <Pill tone={open ? "status.needs_user_approval" : "neutral"}>
            {STATE_LABEL[state]}
          </Pill>
        </span>
      </div>

      {prose && <p className={css.prose}>{prose}</p>}

      {questions !== undefined ? (
        <div className={css.formCard} data-form-card>
          <div className={css.formCardHead}>
            <span className={css.formCardTitle}>
              <span aria-hidden="true">📋</span> Form{phase ? <> · {phase}</> : null}
            </span>
            {showBlocking && (
              <span data-blocks-ticket>
                <Pill tone="risk.critical">Blocks ticket</Pill>
              </span>
            )}
          </div>

          <QuestionList
            questions={questions}
            interactive={interactive}
            submitting={submitting}
            author={author}
            onSubmit={onSubmit}
          />
        </div>
      ) : (
        <>
          {showBlocking && (
            <div className={css.head}>
              <span data-blocks-ticket>
                <Pill tone="risk.critical">Blocks ticket</Pill>
              </span>
            </div>
          )}
          {children && (
            <div className={css.body} data-form-body>
              {children}
            </div>
          )}
          {footer && (
            <div className={css.footer} data-form-footer>
              {footer}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Questions + submit gating ────────────────────────────────── */

function isAnswered(q: FormCommentQuestion, value: unknown): boolean {
  switch (q.type) {
    case "multi_select":
      return Array.isArray(value) && value.length > 0;
    case "boolean":
      return typeof value === "boolean";
    default:
      return typeof value === "string" && value.trim().length > 0;
  }
}

function QuestionList({
  questions,
  interactive,
  submitting,
  author,
  onSubmit,
}: {
  questions: FormCommentQuestion[];
  interactive: boolean;
  submitting?: boolean;
  author: FormCommentCardProps["author"];
  onSubmit?(answers: FormCommentAnswers): void;
}) {
  const [answers, setAnswers] = useState<FormCommentAnswers>({});

  const allRequiredAnswered = useMemo(
    () =>
      questions
        .filter((q) => q.required)
        .every((q) => isAnswered(q, answers[q.key])),
    [questions, answers],
  );

  function set(key: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <>
      <ol className={css.questions}>
        {questions.map((q, i) => (
          <li key={q.key} className={css.question}>
            <span className={css.qEyebrow}>Q{i + 1}</span>
            <span className={css.qLabel}>
              {q.label}
              {q.required && <span className={css.requiredTag}>Required</span>}
            </span>
            {q.helpText && <span className={css.qHelp}>{q.helpText}</span>}
            <Field
              q={q}
              value={answers[q.key]}
              disabled={!interactive}
              onChange={(v) => set(q.key, v)}
            />
          </li>
        ))}
      </ol>

      {interactive && (
        <div className={css.footer} data-form-footer>
          <span className={css.helper}>
            Answering unblocks the ticket and notifies {author}.
          </span>
          <span className={css.submit}>
            <Button
              variant="primary"
              type="button"
              disabled={!allRequiredAnswered || Boolean(submitting)}
              onClick={() => onSubmit?.(answers)}
            >
              {submitting ? "Submitting…" : "Submit answers"}
            </Button>
          </span>
        </div>
      )}
    </>
  );
}

/* ── Field subcomponents ──────────────────────────────────────── */

function Field({
  q,
  value,
  disabled,
  onChange,
}: {
  q: FormCommentQuestion;
  value: unknown;
  disabled: boolean;
  onChange(value: unknown): void;
}) {
  switch (q.type) {
    case "single_select":
      return (
        <RadioRows
          name={q.key}
          options={q.options ?? []}
          value={typeof value === "string" ? value : null}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "boolean":
      return (
        <RadioRows
          name={q.key}
          options={[
            { label: "Yes", value: "true" },
            { label: "No", value: "false" },
          ]}
          value={value === true ? "true" : value === false ? "false" : null}
          disabled={disabled}
          onChange={(v) => onChange(v === "true")}
        />
      );
    case "multi_select":
      return (
        <CheckboxRows
          name={q.key}
          options={q.options ?? []}
          value={Array.isArray(value) ? (value as string[]) : []}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "long_text":
      return (
        <textarea
          className={css.textarea}
          value={typeof value === "string" ? value : ""}
          placeholder="Type your answer…"
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "short_text":
    default:
      return (
        <input
          className={css.input}
          type="text"
          value={typeof value === "string" ? value : ""}
          placeholder="Type your answer…"
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function RadioRows({
  name,
  options,
  value,
  disabled,
  onChange,
}: {
  name: string;
  options: { label: string; value: string }[];
  value: string | null;
  disabled: boolean;
  onChange(value: string): void;
}) {
  return (
    <div className={css.optionRows}>
      {options.map((o) => (
        <label
          key={o.value}
          className={css.optionRow}
          data-selected={value === o.value ? "true" : undefined}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

function CheckboxRows({
  name,
  options,
  value,
  disabled,
  onChange,
}: {
  name: string;
  options: { label: string; value: string }[];
  value: string[];
  disabled: boolean;
  onChange(value: string[]): void;
}) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }
  return (
    <div className={css.optionRows}>
      {options.map((o) => (
        <label
          key={o.value}
          className={css.optionRow}
          data-selected={value.includes(o.value) ? "true" : undefined}
        >
          <input
            type="checkbox"
            name={name}
            value={o.value}
            checked={value.includes(o.value)}
            disabled={disabled}
            onChange={() => toggle(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
