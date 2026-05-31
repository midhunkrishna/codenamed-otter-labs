/**
 * Clarification-form REST routes (MIN-27, plan §2.6) — Impl-B.
 *
 *   POST /api/tickets/:ticketId/forms   -> 201 { form, comment } | 400 invalid schema | 404 ticket
 *   GET  /api/tickets/:ticketId/forms   -> 200 Form[]            | 404 ticket
 *   GET  /api/forms/:formId             -> 200 Form              | 404
 *   POST /api/forms/:formId/submit      -> 200 { form, transcript } | 400 invalid answers | 409 not open | 404
 *   POST /api/forms/:formId/dismiss     -> 200 { form }          | 409 not open | 404
 *
 * The lifecycle service (`createFormService`) owns all behavior + broadcasts; this
 * module only maps HTTP ⇆ service and translates typed errors to status codes:
 *  - `FormValidationError` (bad schema / bad answers) → 400 with `{ error, code, key }`;
 *  - `FormConflictError` (form not open / not found) → 409 (form) / 404 (ticket).
 */
import type { FastifyInstance } from "fastify";
import {
  createFormRepository,
  createTicketRepository,
  type Database,
} from "@otter/persistence";
import {
  API_PREFIX,
  FormValidationError,
  isFormPhase,
  type CreateFormInput,
  type SubmitFormInput,
} from "@otter/shared";
import { FormConflictError, type FormService } from "../forms/service.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Map a {@link FormValidationError} to a 400 body with its machine code + key. */
function validationBody(err: FormValidationError): { error: string; code: string; key?: string } {
  return err.key !== undefined
    ? { error: err.message, code: err.code, key: err.key }
    : { error: err.message, code: err.code };
}

/** Collaborators the forms routes need. The form service is injected (DI). */
export interface FormsRoutesDeps {
  db: Database.Database;
  formService: FormService;
}

export function registerFormsRoutes(app: FastifyInstance, deps: FormsRoutesDeps): void {
  const forms = createFormRepository(deps.db);
  const tickets = createTicketRepository(deps.db);
  const { formService } = deps;

  app.post<{ Params: { ticketId: string } }>(
    `${API_PREFIX}/tickets/:ticketId/forms`,
    async (req, reply) => {
      if (!tickets.get(req.params.ticketId)) {
        return reply.code(404).send({ error: "ticket not found" });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (!isPlainObject(body)) {
        return reply.code(400).send({ error: "body must be a JSON object" });
      }
      // Light shape checks before the schema validator (which owns question rules).
      if (!isFormPhase(body.phase)) {
        return reply.code(400).send({ error: "phase is required and must be a valid form phase" });
      }
      if (typeof body.title !== "string" || body.title.trim() === "") {
        return reply.code(400).send({ error: "title is required and must be a non-empty string" });
      }
      if (typeof body.commentBody !== "string" || body.commentBody.trim() === "") {
        return reply.code(400).send({ error: "commentBody is required and must be a non-empty string" });
      }

      const input = body as unknown as CreateFormInput;
      try {
        const { form, comment } = formService.createForm(req.params.ticketId, input);
        return reply.code(201).send({ form, comment });
      } catch (err) {
        if (err instanceof FormValidationError) {
          return reply.code(400).send(validationBody(err));
        }
        throw err;
      }
    },
  );

  app.get<{ Params: { ticketId: string } }>(
    `${API_PREFIX}/tickets/:ticketId/forms`,
    async (req, reply) => {
      if (!tickets.get(req.params.ticketId)) {
        return reply.code(404).send({ error: "ticket not found" });
      }
      return forms.listByTicket(req.params.ticketId);
    },
  );

  app.get<{ Params: { formId: string } }>(`${API_PREFIX}/forms/:formId`, async (req, reply) => {
    const form = forms.get(req.params.formId);
    if (!form) return reply.code(404).send({ error: "form not found" });
    return form;
  });

  app.post<{ Params: { formId: string } }>(
    `${API_PREFIX}/forms/:formId/submit`,
    async (req, reply) => {
      if (!forms.get(req.params.formId)) {
        return reply.code(404).send({ error: "form not found" });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (body.answers !== undefined && !isPlainObject(body.answers)) {
        return reply.code(400).send({ error: "answers must be a JSON object keyed by question key" });
      }
      const input = (body as unknown as SubmitFormInput) ?? { answers: {} };
      try {
        const { form, transcript } = await formService.submitForm(req.params.formId, input);
        return reply.code(200).send({ form, transcript });
      } catch (err) {
        if (err instanceof FormValidationError) {
          return reply.code(400).send(validationBody(err));
        }
        if (err instanceof FormConflictError) {
          return reply.code(409).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  app.post<{ Params: { formId: string } }>(
    `${API_PREFIX}/forms/:formId/dismiss`,
    async (req, reply) => {
      if (!forms.get(req.params.formId)) {
        return reply.code(404).send({ error: "form not found" });
      }
      const body = (req.body ?? {}) as { reason?: unknown; byUserId?: unknown };
      const reason = typeof body.reason === "string" ? body.reason : undefined;
      const byUserId = typeof body.byUserId === "string" ? body.byUserId : undefined;
      try {
        const form = formService.dismissForm(req.params.formId, reason, byUserId);
        return reply.code(200).send({ form });
      } catch (err) {
        if (err instanceof FormConflictError) {
          return reply.code(409).send({ error: err.message });
        }
        throw err;
      }
    },
  );
}
