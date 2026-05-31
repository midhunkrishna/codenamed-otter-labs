import { describe, expect, it } from "vitest";
import {
  FORM_FIELD_TYPES,
  FORM_MARKER_END,
  FORM_MARKER_START,
  FORM_STATUSES,
  FormValidationError,
  validateAnswers,
  validateFormSchema,
  type CreateFormInput,
  type Form,
  type FormQuestion,
} from "./forms.js";

/** A minimal valid create input, overridable per test. */
function createInput(over: Partial<CreateFormInput> = {}): CreateFormInput {
  return {
    phase: "planning",
    title: "Clarify",
    commentBody: "Please answer",
    questions: [{ key: "q1", type: "short_text", label: "Q1" }],
    ...over,
  };
}

/** Build a hydrated Form from a list of questions (status/ids are filler). */
function formWith(questions: Partial<FormQuestion>[]): Form {
  return {
    id: "form_1",
    projectId: "local-project",
    ticketId: "t1",
    commentId: "c1",
    runId: null,
    status: "open",
    phase: "planning",
    title: "T",
    description: "",
    blocksTicket: true,
    createdByAgentId: null,
    createdAt: "now",
    submittedAt: null,
    dismissedAt: null,
    answers: [],
    questions: questions.map((q, i) => ({
      id: `q_${i}`,
      formId: "form_1",
      key: q.key ?? `k${i}`,
      type: q.type ?? "short_text",
      label: q.label ?? "L",
      helpText: q.helpText ?? "",
      required: q.required ?? false,
      options: q.options ?? [],
      defaultValue: q.defaultValue ?? null,
      sortOrder: q.sortOrder ?? i,
    })),
  };
}

describe("constants", () => {
  it("exposes the five MVP field types and the markers", () => {
    expect(FORM_FIELD_TYPES).toEqual([
      "short_text",
      "long_text",
      "single_select",
      "multi_select",
      "boolean",
    ]);
    expect(FORM_STATUSES[0]).toBe("open");
    expect(FORM_MARKER_START).toBe("<<<OTTER_FORM>>>");
    expect(FORM_MARKER_END).toBe("<<<OTTER_FORM_END>>>");
  });
});

describe("validateFormSchema", () => {
  it("accepts a well-formed schema", () => {
    expect(() => validateFormSchema(createInput())).not.toThrow();
    expect(() =>
      validateFormSchema(
        createInput({
          questions: [
            { key: "a", type: "single_select", label: "A", options: [{ label: "X", value: "x" }] },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("rejects an unsupported field type", () => {
    try {
      validateFormSchema(
        createInput({
          // @ts-expect-error deliberate bad type
          questions: [{ key: "a", type: "rating", label: "A" }],
        }),
      );
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(FormValidationError);
      expect((e as FormValidationError).code).toBe("unsupported_field_type");
    }
  });

  it("rejects duplicate question keys", () => {
    try {
      validateFormSchema(
        createInput({
          questions: [
            { key: "dup", type: "short_text", label: "A" },
            { key: "dup", type: "short_text", label: "B" },
          ],
        }),
      );
      throw new Error("expected throw");
    } catch (e) {
      expect((e as FormValidationError).code).toBe("duplicate_key");
    }
  });

  it("rejects single_select / multi_select without options", () => {
    expect(() =>
      validateFormSchema(createInput({ questions: [{ key: "a", type: "single_select", label: "A" }] })),
    ).toThrow(FormValidationError);
    expect(() =>
      validateFormSchema(createInput({ questions: [{ key: "a", type: "multi_select", label: "A" }] })),
    ).toThrow(FormValidationError);
  });

  it("rejects an empty question list", () => {
    expect(() => validateFormSchema(createInput({ questions: [] }))).toThrow(FormValidationError);
  });
});

describe("validateAnswers", () => {
  it("rejects a missing required answer", () => {
    const form = formWith([{ key: "name", type: "short_text", required: true }]);
    try {
      validateAnswers(form, {});
      throw new Error("expected throw");
    } catch (e) {
      expect((e as FormValidationError).code).toBe("required_missing");
    }
  });

  it("treats blank/empty as missing for required", () => {
    const form = formWith([{ key: "name", type: "short_text", required: true }]);
    expect(() => validateAnswers(form, { name: "   " })).toThrow(FormValidationError);
  });

  it("rejects a single_select value not in options", () => {
    const form = formWith([
      { key: "color", type: "single_select", required: true, options: [{ label: "Red", value: "red" }] },
    ]);
    try {
      validateAnswers(form, { color: "blue" });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as FormValidationError).code).toBe("select_not_in_options");
    }
  });

  it("rejects a multi_select with an unknown option", () => {
    const form = formWith([
      {
        key: "tags",
        type: "multi_select",
        required: true,
        options: [
          { label: "A", value: "a" },
          { label: "B", value: "b" },
        ],
      },
    ]);
    try {
      validateAnswers(form, { tags: ["a", "z"] });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as FormValidationError).code).toBe("multi_unknown_option");
    }
  });

  it("rejects a non-boolean answer to a boolean question", () => {
    const form = formWith([{ key: "ok", type: "boolean", required: true }]);
    try {
      validateAnswers(form, { ok: "yes" });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as FormValidationError).code).toBe("not_a_boolean");
    }
  });

  it("accepts valid answers across all types", () => {
    const form = formWith([
      { key: "name", type: "short_text", required: true },
      { key: "color", type: "single_select", required: true, options: [{ label: "Red", value: "red" }] },
      {
        key: "tags",
        type: "multi_select",
        required: false,
        options: [
          { label: "A", value: "a" },
          { label: "B", value: "b" },
        ],
      },
      { key: "ok", type: "boolean", required: true },
    ]);
    expect(() =>
      validateAnswers(form, { name: "x", color: "red", tags: ["a"], ok: false }),
    ).not.toThrow();
  });

  it("ignores optional questions left blank", () => {
    const form = formWith([{ key: "note", type: "long_text", required: false }]);
    expect(() => validateAnswers(form, {})).not.toThrow();
  });
});
