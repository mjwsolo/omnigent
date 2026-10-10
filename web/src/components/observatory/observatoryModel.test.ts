import { describe, expect, it } from "vitest";
import type { AnyBlock, BlockContext, ToolGroup } from "@/lib/blocks";
import { observatoryModel } from "./observatoryModel";

const ctx: BlockContext = {
  agent: null,
  depth: 0,
  turn: 0,
  timestamp: 0,
  responseId: "response-1",
  itemId: null,
};
const call = (responseId = "response-1", agentName = "coder"): ToolGroup => ({
  type: "tool_group",
  ctx: { ...ctx, responseId },
  iteration: 0,
  executions: [
    {
      name: "Edit",
      arguments: { file_path: "src/app.ts", new_string: "<script>alert(1)</script>" },
      argsSummary: "",
      callId: "same",
      agentName,
      executedBy: "server",
      output: null,
    },
  ],
});
describe("observatory projection", () => {
  it("pairs outputs with response and agent identity without conflating reused call IDs", () => {
    const blocks: AnyBlock[] = [
      call(),
      call("response-2"),
      call("response-1", "reviewer"),
      {
        type: "tool_result",
        ctx,
        name: "Edit",
        callId: "same",
        agentName: "coder",
        output: "saved",
      },
    ];
    const actions = observatoryModel(blocks);
    expect(actions).toHaveLength(3);
    expect(actions[0].output).toBe("saved");
    expect(actions[1].output).toBeNull();
    expect(actions[2].output).toBeNull();
    expect(actions[0].files).toEqual(["src/app.ts"]);
  });
  it("keeps an empty result distinct from a missing result and does not assert success", () => {
    const block = call();
    block.executions[0].output = "";
    const action = observatoryModel([block])[0];
    expect(action.status).toBe("Result observed");
    expect(action.output).toBe("");
    expect(observatoryModel([call()])[0].status).toBe("No result observed");
  });
  it("deduplicates snapshots, extracts explicit patch paths, and limits links to web URLs", () => {
    const block = call();
    block.executions[0].arguments = {
      patch: "*** Update File: src/a.ts\n*** Delete File: src/b.ts",
    };
    block.executions[0].output = "https://example.com/docs javascript:alert(1)";
    const result = observatoryModel([block, block]);
    expect(result).toHaveLength(1);
    expect(result[0].files).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result[0].links).toEqual(["https://example.com/docs"]);
  });
  it("accumulates exposed reasoning chunks and excludes unexposed raw reasoning fields", () => {
    const blocks: AnyBlock[] = [
      { type: "reasoning_chunk", ctx, text: "Check " },
      { type: "reasoning_chunk", ctx, text: "the imports." },
      {
        type: "reasoning_block",
        ctx: { ...ctx, responseId: "r2" },
        summaryText: "",
        reasoningText: "PRIVATE",
      },
    ];
    const result = observatoryModel(blocks);
    expect(result).toHaveLength(1);
    expect(result[0].output).toBe("Check the imports.");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
});
