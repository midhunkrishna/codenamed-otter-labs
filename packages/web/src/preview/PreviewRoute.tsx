import { useState } from "react";
import {
  ATTENTION_TYPES,
  RISKS,
  TICKET_STATUSES,
  type AttentionType,
  type Owner,
  type Priority,
} from "../design/tokens";
import {
  AppShell,
  ApprovalCard,
  AttentionCard,
  Badge,
  Button,
  Card,
  CodeBlock,
  Drawer,
  EmptyState,
  ExpandedAttentionCard,
  FormCommentCard,
  MetadataRow,
  PageHeader,
  Pill,
  PlanCard,
  SectionHeader,
  Sidebar,
  Tabs,
  TicketCard,
  VerificationPacketTabs,
  type VerificationTab,
} from "../ui";
import type { FormCommentQuestion } from "../ui/types";
import { ownerForTicket, statusLabel } from "../components/status";
import { ThemeControls } from "../app/ThemeControls";
import * as css from "./PreviewRoute.css";

/** The OTR-101 OAuth clarification scenario (plan §1.5), one of each field type. */
const OAUTH_QUESTIONS: FormCommentQuestion[] = [
  {
    key: "provider",
    type: "single_select",
    label: "Which OAuth provider should we integrate first?",
    required: true,
    options: [
      { label: "Google", value: "google" },
      { label: "GitHub", value: "github" },
      { label: "Microsoft", value: "microsoft" },
    ],
  },
  {
    key: "scopes",
    type: "multi_select",
    label: "Which scopes do we need?",
    helpText: "Pick all that apply.",
    options: [
      { label: "Profile", value: "profile" },
      { label: "Email", value: "email" },
      { label: "Calendar", value: "calendar" },
    ],
  },
  {
    key: "refresh",
    type: "boolean",
    label: "Should we support refresh tokens?",
    required: true,
  },
  {
    key: "redirect",
    type: "short_text",
    label: "What redirect URI should we register?",
  },
  {
    key: "notes",
    type: "long_text",
    label: "Any other constraints we should know about?",
  },
];

/** Owner per attention type, just for visually varied specimen cards. */
const ATTENTION_PRIORITY: Record<AttentionType, Priority> = {
  permission_request: "high",
  plan_approval: "normal",
  clarification_required: "normal",
  verification_review: "high",
  execution_failed: "urgent",
  run_stalled: "urgent",
};

function Specimen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={css.specimen}>
      <span className={css.specimenLabel}>{label}</span>
      {children}
    </div>
  );
}

/**
 * Components gallery. Renders EVERY one of the 20 primitives with representative
 * props — every TicketCard lifecycle status, an ApprovalCard per risk, an
 * AttentionCard per type, and the VerificationPacketTabs four lenses — plus
 * live theme + density controls so a reviewer can see all primitives in all
 * four themes. Satisfies MIN-43 "a component preview page demonstrates all
 * primitives in all themes."
 */
export function PreviewRoute() {
  const [tab, setTab] = useState("overview");
  const [vtab, setVtab] = useState<VerificationTab>("walkthrough");
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className={css.root} data-testid="preview-route">
      <PageHeader
        eyebrow="Design system"
        title="Components"
        description="Every primitive in the live theme + density. Switch them to preview all four themes."
        actions={<ThemeControls className={css.inlineRow} />}
      />

      <div className={css.controls}>
        <ThemeControls />
      </div>

      {/* ── Layout / chrome ──────────────────────────────────── */}
      <SectionHeader title="Layout & chrome" tag="6 primitives" />
      <Specimen label="AppShell + Sidebar">
        <div className={css.shellFrame}>
          <AppShell
            topbar={<strong>Topbar slot</strong>}
            sidebar={
              <Sidebar
                brand="Otter"
                activeId="board"
                onNavigate={() => {}}
                sections={[
                  {
                    title: "Workspace",
                    items: [
                      { id: "board", label: "Board" },
                      {
                        id: "approvals",
                        label: "Approvals",
                        badge: 3,
                        badgeTone: "risk.high",
                      },
                    ],
                  },
                ]}
                footer={<span>footer</span>}
              />
            }
          >
            <EmptyState
              title="Content area"
              description="AppShell grid: sidebar + topbar + scrollable content."
            />
          </AppShell>
        </div>
      </Specimen>

      <div className={css.grid}>
        <Specimen label="PageHeader">
          <PageHeader
            eyebrow="MIN-43"
            title="Page title"
            description="Description text."
            actions={<Button variant="primary">Action</Button>}
          />
        </Specimen>
        <Specimen label="SectionHeader">
          <SectionHeader title="Section" tag="tag" actions={<Button>Edit</Button>} />
        </Specimen>
        <Specimen label="EmptyState">
          <EmptyState
            title="Nothing here yet"
            description="An empty state."
            action={<Button variant="primary">Create</Button>}
          />
        </Specimen>
      </div>

      {/* ── Generic surfaces ─────────────────────────────────── */}
      <SectionHeader title="Generic surfaces" tag="7 primitives" />
      <div className={css.grid}>
        <Specimen label="Card (owner + tone + block)">
          <Card owner="agent" tone="in_progress">
            Agent-owned, in progress.
          </Card>
          <Card owner="user" tone="needs_user_approval" blockReason="Awaiting approval">
            Blocked card with block stripe.
          </Card>
        </Specimen>
        <Specimen label="Pill (every tone family)">
          <div className={css.inlineRow}>
            <Pill tone="status.done">Done</Pill>
            <Pill tone="risk.critical">Critical</Pill>
            <Pill tone="attention.permission_request">Permission</Pill>
            <Pill tone="owner.agent">Agent</Pill>
            <Pill tone="neutral">Neutral</Pill>
            <Pill tone="accent">Accent</Pill>
          </div>
        </Specimen>
        <Specimen label="Badge">
          <div className={css.inlineRow}>
            <Badge tone="risk.high" count={7} />
            <Badge tone="accent">New</Badge>
          </div>
        </Specimen>
        <Specimen label="Button (all variants)">
          <div className={css.inlineRow}>
            <Button variant="primary">Primary</Button>
            <Button variant="default">Default</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Specimen>
        <Specimen label="Tabs">
          <Tabs
            activeId={tab}
            onSelect={setTab}
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "activity", label: "Activity" },
              { id: "files", label: "Files" },
            ]}
          />
        </Specimen>
        <Specimen label="CodeBlock">
          <CodeBlock code={"git push --force origin main"} />
          <span>
            inline: <CodeBlock inline code="rm -rf node_modules" />
          </span>
        </Specimen>
        <Specimen label="MetadataRow">
          <MetadataRow
            items={[
              { label: "Status", value: "In progress" },
              { label: "Owner", value: "agent" },
              { label: "Risk", value: "medium" },
              { label: "Updated", value: "2m ago" },
            ]}
          />
        </Specimen>
        <Specimen label="Drawer">
          <Button onClick={() => setDrawerOpen(true)}>Open drawer</Button>
          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            title="Drawer title"
          >
            <p>Side drawer body content.</p>
          </Drawer>
        </Specimen>
      </div>

      {/* ── Domain: TicketCard per status ────────────────────── */}
      <SectionHeader title="TicketCard — every lifecycle status" tag="domain" />
      <div className={css.grid}>
        {TICKET_STATUSES.map((status) => {
          const owner: Owner = ownerForTicket(status, "none");
          return (
            <TicketCard
              key={status}
              ticketKey={`OTT-${status}`}
              title={statusLabel(status)}
              status={status}
              owner={owner}
              priority="High"
              phase={
                owner === "agent"
                  ? { owner: "agent", label: "Executing", percent: 62 }
                  : { owner, label: statusLabel(status) }
              }
            />
          );
        })}
        <TicketCard
          ticketKey="OTT-blocked"
          title="Blocked ticket"
          status="in_progress"
          owner="agent"
          blockStatus="blocked"
          blockReason="Waiting on user approval"
        />
      </div>

      {/* ── Domain: AttentionCard per type ───────────────────── */}
      <SectionHeader title="AttentionCard — every type" tag="domain" />
      <div className={css.grid}>
        {ATTENTION_TYPES.map((type) => (
          <AttentionCard
            key={type}
            type={type}
            priority={ATTENTION_PRIORITY[type]}
            title={`${type} attention item`}
            summary="A short summary of what needs attention."
            requiredAction="Review and respond"
            ticketKey="OTT-42"
            onClick={() => {}}
          />
        ))}
        <ExpandedAttentionCard
          type="plan_approval"
          priority="high"
          title="Expanded attention card"
          summary="Sticky expanded variant with a source-specific body."
          ticketKey="OTT-43"
          sticky
        >
          <p>Source-specific expanded body goes here.</p>
        </ExpandedAttentionCard>
      </div>

      {/* ── Domain: ApprovalCard per risk ────────────────────── */}
      <SectionHeader title="ApprovalCard — risk pills" tag="domain" />
      <div className={css.grid}>
        {RISKS.map((risk) => (
          <ApprovalCard
            key={risk}
            actor="agent-7"
            intent={`wants to run a ${risk}-risk command`}
            command="kubectl delete pod web-0"
            risk={risk}
            facts={[
              { label: "Namespace", value: "prod" },
              { label: "Blast radius", value: "1 pod" },
            ]}
            onApprove={() => {}}
            onDeny={() => {}}
            onRevise={() => {}}
          />
        ))}
      </div>

      {/* ── Domain: PlanCard + FormCommentCard ────────────────── */}
      <SectionHeader title="PlanCard & FormCommentCard" tag="domain" />
      <div className={css.grid}>
        <PlanCard
          version="v2"
          state="proposed"
          title="Migrate board to primitives"
          meta="3 files · ~120 LOC"
          onApprove={() => {}}
          onReject={() => {}}
        >
          <p>Approach: replace hand-rolled markup with ui primitives.</p>
        </PlanCard>
        <PlanCard version="v1" state="superseded" title="Superseded plan" />
      </div>

      {/* ── Domain: FormCommentCard (the OTR-101 clarification form) ── */}
      <SectionHeader
        title="FormCommentCard — clarification form"
        tag="domain"
      />
      <div className={css.grid}>
        <Specimen label="FormCommentCard — clarification form (open, blocking)">
          <FormCommentCard
            author="planner-agent"
            state="open"
            blocking
            phase="planning"
            time="2m ago"
            prose="Before I plan the auth work, I need a couple of decisions from you."
            questions={OAUTH_QUESTIONS}
            onSubmit={() => {}}
          />
        </Specimen>
        <Specimen label="FormCommentCard — submitted (resolved)">
          <FormCommentCard
            author="planner-agent"
            state="submitted"
            phase="planning"
            time="1m ago"
            prose="Thanks — using the answers below to plan."
            questions={OAUTH_QUESTIONS}
            onSubmit={() => {}}
          />
        </Specimen>
      </div>

      {/* ── Domain: VerificationPacketTabs ───────────────────── */}
      <SectionHeader title="VerificationPacketTabs — four lenses" tag="domain" />
      <Specimen label="VerificationPacketTabs">
        <VerificationPacketTabs
          activeTab={vtab}
          onSelect={setVtab}
          walkthrough={<p>Walkthrough: how the change behaves.</p>}
          verify={<p>Verify: steps to confirm it works.</p>}
          facts={<p>Facts: the diff and key metrics.</p>}
          why={<p>Why: the reasoning behind the change.</p>}
        />
      </Specimen>
    </div>
  );
}
