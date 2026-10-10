import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnyBlock } from "@/lib/blocks";
import { ObservatoryContent } from "./SessionObservatory";
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
  useChatStore.setState({ conversationId: "session-a", blocks: [], sessionStatus: "idle" });
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
