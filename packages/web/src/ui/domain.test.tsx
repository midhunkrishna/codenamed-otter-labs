import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TicketCard } from "./TicketCard";
import { AttentionCard } from "./AttentionCard";
import { ExpandedAttentionCard } from "./ExpandedAttentionCard";
import { ApprovalCard } from "./ApprovalCard";
import { PlanCard } from "./PlanCard";
import { FormCommentCard } from "./FormCommentCard";
import { VerificationPacketTabs } from "./VerificationPacketTabs";

/**
 * Domain-primitive tests (Impl-C). Rendered WITHOUT a ThemeProvider — we assert
 * structure / classes / data-attributes / inline contract-var references, never
 * computed colors (those only resolve once a theme class is on <html>).
 */

describe("TicketCard", () => {
  it("renders the owner stripe and reflects the status tone", () => {
    const { container } = render(
      <TicketCard
        ticketKey="MIN-43"
        title="Design system"
        status="in_progress"
        owner="agent"
      />,
    );
    const card = container.querySelector("[data-status]")!;
    expect(card).toHaveAttribute("data-status", "in_progress");
    expect(card).toHaveAttribute("data-owner", "agent");
    // owner stripe present, tagged with the owner
    const stripe = container.querySelector("[data-owner-stripe]")!;
    expect(stripe).toBeInTheDocument();
    expect(stripe).toHaveAttribute("data-owner-stripe", "agent");
    // status tone is a contract-var reference (var(--...)), not a raw color
    expect(card.getAttribute("data-status-tone")).toMatch(/^var\(/);
    expect(screen.getByText("MIN-43")).toBeInTheDocument();
  });

  it("shows the agent pulse + progress bar only for an agent phase with percent", () => {
    const { container } = render(
      <TicketCard
        ticketKey="MIN-1"
        title="Working"
        status="in_progress"
        owner="agent"
        phase={{ owner: "agent", label: "Implementing", percent: 42 }}
      />,
    );
    expect(container.querySelector("[data-agent-pulse]")).toBeInTheDocument();
    const bar = container.querySelector("[role=progressbar]")!;
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("does NOT pulse for a user-owned phase", () => {
    const { container } = render(
      <TicketCard
        ticketKey="MIN-2"
        title="Awaiting you"
        status="needs_user_review"
        owner="user"
        phase={{ owner: "user", label: "Your review" }}
      />,
    );
    expect(container.querySelector("[data-agent-pulse]")).toBeNull();
    expect(container.querySelector("[role=progressbar]")).toBeNull();
  });

  it("renders the amber block stripe and shifts the owner stripe to blocked", () => {
    const { container } = render(
      <TicketCard
        ticketKey="MIN-3"
        title="Stuck"
        status="in_progress"
        owner="agent"
        blockStatus="blocked"
        blockReason="Waiting on credentials"
      />,
    );
    expect(container.querySelector("[data-block-stripe]")).toBeInTheDocument();
    expect(screen.getByText("Waiting on credentials")).toBeInTheDocument();
    // owner stripe is amber/blocked, not agent
    expect(
      container.querySelector("[data-owner-stripe]"),
    ).toHaveAttribute("data-owner-stripe", "blocked");
  });

  it("calls onClick when interactive", () => {
    const onClick = vi.fn();
    render(
      <TicketCard
        ticketKey="MIN-4"
        title="Click me"
        status="created"
        owner="user"
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByText("Click me"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("AttentionCard", () => {
  it("renders the type accent and priority tone", () => {
    const { container } = render(
      <AttentionCard
        type="permission_request"
        priority="urgent"
        title="Approve shell command"
        summary="Agent wants to run a command"
        requiredAction="Approve or deny"
        ticketKey="MIN-9"
      />,
    );
    const card = container.querySelector("[data-attention-type]")!;
    expect(card).toHaveAttribute("data-attention-type", "permission_request");
    expect(card).toHaveAttribute("data-priority", "urgent");
    expect(screen.getByText("Permission required")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.getByText("MIN-9")).toBeInTheDocument();
    expect(
      container.querySelector("[data-required-action]"),
    ).toHaveTextContent("Approve or deny");
  });

  it("fires onClick", () => {
    const onClick = vi.fn();
    render(
      <AttentionCard
        type="clarification_required"
        priority="normal"
        title="A question"
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByText("A question"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("ExpandedAttentionCard", () => {
  it("renders the shared header plus the source body and supports sticky", () => {
    const { container } = render(
      <ExpandedAttentionCard
        type="plan_approval"
        priority="high"
        title="Plan ready"
        sticky
      >
        <div data-source-body>Approach details</div>
      </ExpandedAttentionCard>,
    );
    expect(
      container.querySelector("[data-attention-type=plan_approval]"),
    ).toHaveAttribute("data-sticky", "true");
    expect(screen.getByText("Plan approval required")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(
      container.querySelector("[data-expanded-body] [data-source-body]"),
    ).toHaveTextContent("Approach details");
  });
});

describe("ApprovalCard", () => {
  it("renders the risk tone pill and the verbatim command", () => {
    const command = 'rm -rf ./build && echo "done"';
    const { container } = render(
      <ApprovalCard
        actor="Agent"
        intent="wants to run a command"
        command={command}
        risk="high"
        facts={[
          { label: "Working dir", value: "/repo" },
          { label: "Timeout", value: "120s" },
        ]}
        onApprove={() => {}}
        onDeny={() => {}}
        onRevise={() => {}}
      />,
    );
    expect(container.querySelector("[data-risk=high]")).toBeInTheDocument();
    // risk pill carries the risk tone selector + the label
    expect(container.querySelector('[data-tone="risk.high"]')).toHaveTextContent(
      "High",
    );
    // command rendered verbatim (never paraphrased)
    expect(screen.getByText(command)).toBeInTheDocument();
    // facts grid
    expect(screen.getByText("Working dir")).toBeInTheDocument();
    expect(screen.getByText("/repo")).toBeInTheDocument();
    // the three actions
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Deny")).toBeInTheDocument();
    expect(screen.getByText("Revise")).toBeInTheDocument();
  });
});

describe("PlanCard", () => {
  it("renders version + state pill and toggles the body", () => {
    const { container } = render(
      <PlanCard
        version="v2"
        state="proposed"
        title="Refactor the store"
        meta="3 files"
        onApprove={() => {}}
        onReject={() => {}}
      >
        <div data-approach>Approach</div>
      </PlanCard>,
    );
    expect(container.querySelector("[data-plan-state=proposed]")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(container.querySelector('[data-tone="status.plannable"]')).toHaveTextContent(
      "Proposed",
    );
    // body visible by default, toggle hides it
    expect(container.querySelector("[data-plan-body]")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hide details"));
    expect(container.querySelector("[data-plan-body]")).toBeNull();
    // actionable -> approve/reject shown
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it("hides actions when not actionable (approved)", () => {
    render(
      <PlanCard
        version="v1"
        state="approved"
        title="Locked plan"
        onApprove={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Reject")).toBeNull();
  });
});

describe("FormCommentCard", () => {
  it("shows the blocking pill when open + blocking", () => {
    const { container } = render(
      <FormCommentCard author="Agent" state="open" blocking>
        <div>Which database?</div>
      </FormCommentCard>,
    );
    expect(container.querySelector("[data-blocking=true]")).toBeInTheDocument();
    const blocks = container.querySelector("[data-blocks-ticket]")!;
    expect(blocks).toHaveTextContent("Blocks ticket");
    expect(blocks.querySelector('[data-tone="risk.critical"]')).toBeInTheDocument();
    expect(screen.getByText("Which database?")).toBeInTheDocument();
  });

  it("does NOT show the blocking pill once submitted", () => {
    const { container } = render(
      <FormCommentCard author="Agent" state="submitted" blocking>
        <div>answered</div>
      </FormCommentCard>,
    );
    expect(container.querySelector("[data-blocks-ticket]")).toBeNull();
    expect(container.querySelector("[data-form-state=submitted]")).toBeInTheDocument();
  });
});

describe("VerificationPacketTabs", () => {
  it("renders all four lenses in order and shows the active section", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <VerificationPacketTabs
        activeTab="walkthrough"
        onSelect={onSelect}
        walkthrough={<div>WALK</div>}
        verify={<div>VERIFY</div>}
        facts={<div>FACTS</div>}
        why={<div>WHY</div>}
      />,
    );
    const tabs = Array.from(container.querySelectorAll("[role=tab]")).map(
      (t) => t.textContent,
    );
    expect(tabs).toEqual(["Walkthrough", "Verify", "Facts", "Why"]);
    // active section shown
    expect(screen.getByText("WALK")).toBeInTheDocument();
    expect(screen.queryByText("WHY")).toBeNull();
  });

  it("calls onSelect with the chosen lens", () => {
    const onSelect = vi.fn();
    render(
      <VerificationPacketTabs
        activeTab="walkthrough"
        onSelect={onSelect}
        facts={<div>FACTS</div>}
      />,
    );
    fireEvent.click(screen.getByText("Facts"));
    expect(onSelect).toHaveBeenCalledWith("facts");
  });
});
