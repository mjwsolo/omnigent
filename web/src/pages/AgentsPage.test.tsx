import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "@/hooks/useConversations";
import { AgentsPage, fleetStatus } from "./AgentsPage";

const rows: Conversation[] = [
  {
    id: "a",
    object: "conversation",
    title: "Build frontend",
    created_at: 1,
    updated_at: 2,
    labels: {},
    permission_level: 7,
    agent_name: "Codex",
    owner: "Avery",
    workspace: "/projects/web",
    status: "running",
    runner_online: true,
  },
  {
    id: "b",
    object: "conversation",
    title: "Review API",
    created_at: 1,
    updated_at: 2,
    labels: {},
    permission_level: 3,
    agent_name: "Claude",
    owner: "Morgan",
    workspace: "/projects/api",
    status: "idle",
    pending_elicitations_count: 1,
  },
];
vi.mock("@/hooks/useConversations", () => ({
  useConversations: () => ({
    data: { pages: [{ data: rows }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
  }),
}));
vi.mock("@/hooks/useSessionUpdatesConnected", () => ({ useSessionUpdatesConnected: () => true }));
vi.mock("@/lib/routing", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
afterEach(cleanup);
describe("agent fleet", () => {
  it("shows sessions together and deep-links to the same fork's observatory", () => {
    render(<AgentsPage />);
    expect(screen.getByRole("link", { name: "Build frontend" })).toHaveAttribute(
      "href",
      "/c/a?observatory=1",
    );
    expect(screen.getByRole("link", { name: "Review API" })).toHaveAttribute(
      "href",
      "/c/b?observatory=1",
    );
    expect(screen.getByText("Needs response")).toBeInTheDocument();
    expect(screen.getByText("Session updates connected")).toBeInTheDocument();
  });
  it("searches actual project and owner metadata", () => {
    render(<AgentsPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search loaded sessions" }), {
      target: { value: "Morgan" },
    });
    expect(screen.queryByRole("link", { name: "Build frontend" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review API" })).toBeInTheDocument();
  });
  it("filters the attention queue without hiding the normal session route", () => {
    render(<AgentsPage />);
    const tab = screen.getByRole("tab", { name: "Needs attention" });
    fireEvent.focus(tab);
    fireEvent.click(tab);
    expect(screen.queryByRole("link", { name: "Build frontend" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review API" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open approvals inbox" })).toHaveAttribute(
      "href",
      "/inbox",
    );
  });
  it("does not equate idle, disconnected, or unknown status with completion", () => {
    expect(fleetStatus({ ...rows[0], status: "idle" })).toBe("Idle");
    expect(fleetStatus({ ...rows[0], runner_online: false })).toBe("Runner offline");
    expect(fleetStatus({ ...rows[0], status: undefined, runner_online: undefined })).toBe(
      "Unknown",
    );
    expect(fleetStatus({ ...rows[1], runner_online: false })).toBe("Needs response");
  });
});
