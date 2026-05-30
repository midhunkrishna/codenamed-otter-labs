import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Card } from "./Card";
import { Pill } from "./Pill";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { AppShell } from "./AppShell";
import { Sidebar } from "./Sidebar";
import { PageHeader } from "./PageHeader";
import { SectionHeader } from "./SectionHeader";
import { Tabs } from "./Tabs";
import { Drawer } from "./Drawer";
import { EmptyState } from "./EmptyState";
import { CodeBlock } from "./CodeBlock";
import { MetadataRow } from "./MetadataRow";

import { ownerTone, statusTone, riskTone } from "../design/tokens";
import * as cardStyles from "./Card.css";
import * as pillStyles from "./Pill.css";

/** `var(--name)` → `--name` so we can read the inline custom property in jsdom. */
const raw = (ref: string) => /^var\(\s*(--[^,)\s]+)/.exec(ref)?.[1] ?? ref;
const cssVar = (el: HTMLElement, ref: string) =>
  el.style.getPropertyValue(raw(ref));

describe("Card", () => {
  it("renders children", () => {
    render(<Card>hello</Card>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("applies the owner stripe (agent) via the stripe CSS var", () => {
    render(<Card owner="agent">x</Card>);
    const el = screen.getByText("x");
    expect(el).toHaveClass(cardStyles.owned);
    expect(el).toHaveAttribute("data-owner", "agent");
    expect(cssVar(el, cardStyles.stripeColor)).toBe(ownerTone.agent.fg);
  });

  it("applies a status tone to the border via tone vars", () => {
    render(<Card tone="in_progress">x</Card>);
    const el = screen.getByText("x");
    expect(el).toHaveClass(cardStyles.toned);
    expect(el).toHaveAttribute("data-tone", "in_progress");
    expect(cssVar(el, cardStyles.toneSoft)).toBe(statusTone.in_progress.soft);
  });

  it("renders the block stripe and shifts the owner stripe amber when blockReason is set", () => {
    render(
      <Card owner="agent" blockReason="Waiting on approval">
        body
      </Card>,
    );
    expect(screen.getByTestId("card-block-stripe")).toHaveTextContent(
      "Waiting on approval",
    );
    const el = screen.getByText("body");
    expect(el).toHaveAttribute("data-blocked", "true");
    // stripe is amber (blocked) even though owner=agent
    expect(cssVar(el, cardStyles.stripeColor)).toBe(ownerTone.blocked.fg);
  });

  it("is interactive when onClick is given and fires it", () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>clickme</Card>);
    const el = screen.getByText("clickme");
    expect(el).toHaveClass(cardStyles.interactive);
    expect(el).toHaveAttribute("role", "button");
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Pill", () => {
  it("resolves a risk.medium selector to the risk tone vars", () => {
    render(<Pill tone="risk.medium">Medium</Pill>);
    const el = screen.getByText("Medium");
    expect(el).toHaveAttribute("data-tone", "risk.medium");
    expect(cssVar(el, pillStyles.toneFg)).toBe(riskTone.medium.fg);
    expect(cssVar(el, pillStyles.toneSoft)).toBe(riskTone.medium.soft);
  });

  it("resolves a status.done selector", () => {
    render(<Pill tone="status.done">Done</Pill>);
    const el = screen.getByText("Done");
    expect(cssVar(el, pillStyles.toneFg)).toBe(statusTone.done.fg);
  });

  it("defaults to neutral with no tone", () => {
    render(<Pill>plain</Pill>);
    expect(screen.getByText("plain")).toHaveAttribute("data-tone", "neutral");
  });
});

describe("Badge", () => {
  it("renders children with a tone", () => {
    render(<Badge tone="owner.user">User</Badge>);
    expect(screen.getByText("User")).toHaveAttribute("data-tone", "owner.user");
  });

  it("renders a numeric count instead of children", () => {
    render(<Badge count={3}>ignored</Badge>);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("ignored")).not.toBeInTheDocument();
  });
});

describe("Button", () => {
  it("renders each variant", () => {
    const { rerender } = render(<Button variant="primary">P</Button>);
    expect(screen.getByRole("button")).toHaveAttribute(
      "data-variant",
      "primary",
    );
    rerender(<Button variant="danger">D</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-variant", "danger");
    rerender(<Button variant="ghost">G</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-variant", "ghost");
  });

  it("defaults to the default variant and button type", () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("data-variant", "default");
    expect(btn).toHaveAttribute("type", "button");
  });

  it("fires onClick and respects disabled", () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
    rerender(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("AppShell", () => {
  it("renders sidebar, topbar and children", () => {
    render(
      <AppShell sidebar={<nav>side</nav>} topbar={<div>top</div>}>
        <main>content</main>
      </AppShell>,
    );
    expect(screen.getByText("side")).toBeInTheDocument();
    expect(screen.getByText("top")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});

describe("Sidebar", () => {
  it("renders sections, items, badges and brand/footer", () => {
    const onNavigate = vi.fn();
    render(
      <Sidebar
        brand={<span>Otter</span>}
        activeId="board"
        onNavigate={onNavigate}
        footer={<span>Settings</span>}
        sections={[
          {
            title: "Work",
            items: [
              { id: "board", label: "Board" },
              { id: "attn", label: "Attention", badge: 4, badgeTone: "attention.permission" },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("Otter")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Attention"));
    expect(onNavigate).toHaveBeenCalledWith("attn");
  });

  it("marks the active item", () => {
    render(
      <Sidebar
        activeId="board"
        onNavigate={() => {}}
        sections={[{ items: [{ id: "board", label: "Board" }] }]}
      />,
    );
    expect(screen.getByText("Board").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("PageHeader / SectionHeader", () => {
  it("PageHeader renders eyebrow/title/description/actions", () => {
    render(
      <PageHeader
        eyebrow="Project"
        title="Board"
        description="all tickets"
        actions={<button>New</button>}
      />,
    );
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("all tickets")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("SectionHeader renders title and tag", () => {
    render(<SectionHeader title="Recent" tag="updated" />);
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("updated")).toBeInTheDocument();
  });
});

describe("Tabs", () => {
  it("renders tabs, marks the active and switches on select", () => {
    const onSelect = vi.fn();
    render(
      <Tabs
        activeId="a"
        onSelect={onSelect}
        tabs={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Beta" }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });
});

describe("Drawer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <Drawer open={false} onClose={() => {}} title="T">
        body
      </Drawer>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title and children when open, and closes", () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Details">
        body
      </Drawer>,
    );
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("EmptyState", () => {
  it("renders icon/title/description/action", () => {
    render(
      <EmptyState
        icon={<span>icon</span>}
        title="Nothing here"
        description="No tickets yet"
        action={<button>Create</button>}
      />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("No tickets yet")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
  });
});

describe("CodeBlock", () => {
  it("renders code verbatim in a block", () => {
    render(<CodeBlock code="rm -rf /tmp/x" />);
    expect(screen.getByText("rm -rf /tmp/x")).toBeInTheDocument();
  });

  it("renders inline variant", () => {
    render(<CodeBlock code="npm i" inline />);
    const el = screen.getByText("npm i");
    expect(el.tagName).toBe("CODE");
  });
});

describe("MetadataRow", () => {
  it("renders label/value pairs", () => {
    render(
      <MetadataRow
        columns={2}
        items={[
          { label: "Owner", value: "agent" },
          { label: "Risk", value: "medium" },
        ]}
      />,
    );
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("agent")).toBeInTheDocument();
    expect(screen.getByText("Risk")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
  });
});
