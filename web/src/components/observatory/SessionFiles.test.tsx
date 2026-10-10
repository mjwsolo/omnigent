import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionFiles } from "./SessionFiles";

const mocks = vi.hoisted(() => ({
  files: {
    data: {
      available: true,
      data: [{ path: "src/a.ts", status: "modified", lines_added: 2, lines_removed: 1 }],
    } as
      | {
          available: boolean;
          data: { path: string; status: string; lines_added: number; lines_removed: number }[];
        }
      | undefined,
    dataUpdatedAt: 1,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  },
  environment: { data: { available: true }, isError: false, error: null },
  serveable: true,
  diff: {
    data: { before: "old", after: "new" } as
      { before: string | null; after: string | null } | undefined,
    isError: false,
    error: null as Error | null,
  },
  invalidate: vi.fn(),
  useDiff: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("@/hooks/useWorkspaceChangedFiles", () => ({
  useWorkspaceChangedFiles: () => mocks.files,
  useWorkspaceEnvironment: () => mocks.environment,
  useWorkspaceServeable: () => mocks.serveable,
}));
vi.mock("@/hooks/useFileDiff", () => ({
  useFileDiff: (id: string, path: string | null) => {
    mocks.useDiff(id, path);
    return mocks.diff;
  },
}));
vi.mock("@/shell/MonacoDiffViewer", () => ({
  MonacoDiffViewer: ({ before, after }: { before: string | null; after: string | null }) => (
    <div data-testid="diff">{JSON.stringify({ before, after })}</div>
  ),
}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.files.data = {
    available: true,
    data: [{ path: "src/a.ts", status: "modified", lines_added: 2, lines_removed: 1 }],
  };
  mocks.files.dataUpdatedAt = 1;
  mocks.serveable = true;
  mocks.environment.data.available = true;
  mocks.diff.data = { before: "old", after: "new" };
  mocks.diff.isError = false;
  mocks.diff.error = null;
});
describe("observatory workspace files", () => {
  it("selects a saved change and supplies actual before/after to the shared diff viewer", async () => {
    render(<SessionFiles conversationId="a" />);
    fireEvent.click(screen.getByRole("button", { name: /src\/a.ts modified/ }));
    expect(await screen.findByTestId("diff")).toHaveTextContent('"before":"old","after":"new"');
    expect(mocks.useDiff).toHaveBeenLastCalledWith("a", "src/a.ts");
  });
  it("refreshes selected diff when workspace observations change", async () => {
    const { rerender } = render(<SessionFiles conversationId="a" />);
    fireEvent.click(screen.getByRole("button", { name: /src\/a.ts modified/ }));
    await screen.findByTestId("diff");
    mocks.invalidate.mockClear();
    mocks.files.dataUpdatedAt = 2;
    rerender(<SessionFiles conversationId="a" />);
    await waitFor(() =>
      expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["file-diff", "a", "src/a.ts"] }),
    );
  });
  it("does not turn a loading payload into a new or deleted file", () => {
    mocks.diff.data = undefined;
    render(<SessionFiles conversationId="a" />);
    fireEvent.click(screen.getByRole("button", { name: /src\/a.ts modified/ }));
    expect(screen.getByText("Loading diff…")).toBeInTheDocument();
    expect(screen.queryByTestId("diff")).not.toBeInTheDocument();
  });
  it("preserves legitimate nulls for created and deleted file diffs", async () => {
    mocks.diff.data = { before: null, after: "new" };
    const { rerender } = render(<SessionFiles conversationId="a" />);
    fireEvent.click(screen.getByRole("button", { name: /src\/a.ts modified/ }));
    expect(await screen.findByTestId("diff")).toHaveTextContent('"before":null');
    mocks.diff.data = { before: "old", after: null };
    rerender(<SessionFiles conversationId="a" />);
    expect(screen.getByTestId("diff")).toHaveTextContent('"after":null');
  });
  it("shows offline and unavailable states rather than an empty change list", () => {
    mocks.serveable = false;
    const { rerender } = render(<SessionFiles conversationId="a" />);
    expect(screen.getByText(/Workspace is offline/)).toBeInTheDocument();
    mocks.serveable = true;
    mocks.environment.data.available = false;
    rerender(<SessionFiles conversationId="a" />);
    expect(screen.getByText(/no inspectable workspace/)).toBeInTheDocument();
  });
  it("surfaces a diff fetch error and hides a no-longer-changed file", () => {
    mocks.diff.isError = true;
    mocks.diff.error = new Error("Access denied");
    const { rerender } = render(<SessionFiles conversationId="a" />);
    fireEvent.click(screen.getByRole("button", { name: /src\/a.ts modified/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Access denied");
    mocks.files.data!.data = [];
    rerender(<SessionFiles conversationId="a" />);
    expect(screen.getByText(/no longer in the current change list/)).toBeInTheDocument();
  });
});
