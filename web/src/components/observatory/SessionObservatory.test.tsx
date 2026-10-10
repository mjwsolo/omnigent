import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnyBlock } from "@/lib/blocks";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SessionObservatory, ObservatoryContent } from "./SessionObservatory";
import { useChatStore } from "@/store/chatStore";

vi.mock("@/store/chatStore", async () => {
  const { create } = await import("zustand");
  return {
    useChatStore: create(() => ({
      conversationId: "session-a",
      blocks: [] as AnyBlock[],
      sessionStatus: "idle",
      blockedOn: null,
      hasMoreHistory: false,
      todos: [],
    })),
  };
});
const group: AnyBlock = {
  type: "tool_group",
  ctx: { agent: null, depth: 0, turn: 0, timestamp: 0, responseId: "r1", itemId: "i1" },
  iteration: 0,
  executions: [
    {
      name: "Edit",
      arguments: { file_path: "src/a.ts" },
      argsSummary: "",
      callId: "call",
      agentName: "coder",
      executedBy: "server",
      output: null,
    },
  ],
};
afterEach(() => {
  cleanup();
  useChatStore.setState({
    conversationId: "session-a",
    blocks: [],
    sessionStatus: "idle",
    todos: [],
  });
});
describe("session observatory", () => {
  it("reads live session updates, preserves selection and freezes a paused view", () => {
    useChatStore.setState({ blocks: [group] });
    render(<ObservatoryContent conversationId="session-a" />);
    fireEvent.click(screen.getByRole("button", { name: /Edit.*coder/ }));
    expect(screen.getByText("No result payload observed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause view" }));
    act(() =>
      useChatStore.setState({
        blocks: [
          {
            ...group,
            executions: [{ ...group.executions[0], output: "<img src=x onerror=bad()>" }],
          },
        ],
      }),
    );
    expect(screen.getByText("No result payload observed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume view" }));
    expect(screen.getByText("<img src=x onerror=bad()>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
  it("never displays a previous session's content while the requested session loads", () => {
    useChatStore.setState({ blocks: [group] });
    render(<ObservatoryContent conversationId="session-b" />);
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for this session/)).toBeInTheDocument();
  });
  it("uses an explicit file reference as an inspection route", () => {
    useChatStore.setState({ blocks: [group] });
    render(<ObservatoryContent conversationId="session-a" />);
    const tab = screen.getByRole("tab", { name: "File map" });
    fireEvent.focus(tab);
    fireEvent.click(tab);
    fireEvent.click(screen.getByRole("button", { name: "src/a.ts" }));
    expect(screen.getByText("No result payload observed.")).toBeInTheDocument();
  });
});

describe("session task progress", () => {
  it("follows the live harness plan rather than inferring task completion from tool output", () => {
    useChatStore.setState({
      todos: [
        { content: "Implement feature", status: "in_progress", activeForm: "Implementing feature" },
      ],
    });
    render(<ObservatoryContent conversationId="session-a" />);
    fireEvent.focus(screen.getByRole("tab", { name: "Tasks" }));
    fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));
    expect(screen.getByText("0 of 1 tasks reported complete")).toBeInTheDocument();
    expect(screen.getByText("Implementing feature")).toBeInTheDocument();
    act(() =>
      useChatStore.setState({
        todos: [{ content: "Implement feature", status: "completed", activeForm: "" }],
      }),
    );
    expect(screen.getByText("1 of 1 tasks reported complete")).toBeInTheDocument();
    expect(screen.getByText("Reported complete")).toBeInTheDocument();
  });
  it("explains when no plan is available", () => {
    render(<ObservatoryContent conversationId="session-a" />);
    fireEvent.focus(screen.getByRole("tab", { name: "Tasks" }));
    fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));
    expect(screen.getByText(/No task plan has been reported/)).toBeInTheDocument();
  });
});

describe("observatory deep links", () => {
  it("opens from the fleet URL and preserves other parameters when dismissed", () => {
    function Location() {
      return <output data-testid="location">{useLocation().search}</output>;
    }
    render(
      <MemoryRouter initialEntries={["/c/session-a?observatory=1&view=changed"]}>
        <SessionObservatory conversationId="session-a" />
        <Location />
      </MemoryRouter>,
    );
    expect(screen.getByRole("dialog", { name: "Session observatory" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("location")).toHaveTextContent("?view=changed");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
