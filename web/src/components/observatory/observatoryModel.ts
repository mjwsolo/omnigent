import type { AnyBlock } from "@/lib/blocks";

export interface ObservedAction {
  id: string;
  name: string;
  agent: string;
  responseId: string;
  category: "tool" | "web" | "reasoning";
  input: string;
  output: string | null;
  files: string[];
  links: string[];
  status: "Result observed" | "No result observed" | "Reported summary";
}

function linksFrom(text: string): string[] {
  return [...new Set(text.match(/https?:\/\/[^\s<>"'\\)]+/g) ?? [])].slice(0, 20);
}

function referencedFiles(args: Record<string, unknown>): string[] {
  const paths = [args.path, args.file_path, args.filePath, args.notebook_path].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const patch = args.patch ?? args.input;
  if (typeof patch === "string") {
    for (const match of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) {
      paths.push(match[1]);
    }
  }
  return [...new Set(paths)].slice(0, 40);
}

const identity = (response: string, agent: string, call: string) =>
  JSON.stringify([response, agent, call]);

export function observatoryModel(blocks: AnyBlock[]): ObservedAction[] {
  const actions = new Map<string, ObservedAction>();
  const results = new Map<string, string>();
  for (const block of blocks) {
    if (block.type === "tool_result") {
      results.set(identity(block.ctx.responseId, block.agentName, block.callId), block.output);
    }
  }
  for (const [index, block] of blocks.entries()) {
    if (block.type === "tool_group") {
      for (const tool of block.executions) {
        const id = identity(block.ctx.responseId, tool.agentName, tool.callId);
        const previous = actions.get(id);
        const output = results.get(id) ?? tool.output ?? previous?.output ?? null;
        actions.set(id, {
          id,
          name: tool.name,
          agent: tool.agentName || "Main agent",
          responseId: block.ctx.responseId,
          category: /web|browse|search/i.test(tool.name) ? "web" : "tool",
          input: JSON.stringify(tool.arguments, null, 2),
          output,
          files: referencedFiles(tool.arguments),
          links: linksFrom(output ?? ""),
          status: output !== null ? "Result observed" : "No result observed",
        });
      }
    } else if (block.type === "native_tool") {
      const id = block.ctx.itemId ?? `native:${index}`;
      actions.set(id, {
        id,
        name: block.label,
        agent: block.ctx.agent || "Main agent",
        responseId: block.ctx.responseId,
        category: /web|search|browse/.test(block.toolType) ? "web" : "tool",
        input: JSON.stringify(block.data, null, 2),
        output: null,
        files: [],
        links: linksFrom(JSON.stringify(block.data)),
        status: "No result observed",
      });
    } else if (block.type === "reasoning_chunk") {
      const id = identity(block.ctx.responseId, block.ctx.agent ?? "", "reported-reasoning");
      const previous = actions.get(id);
      actions.set(id, {
        id,
        name: "Reported reasoning",
        agent: block.ctx.agent || "Main agent",
        responseId: block.ctx.responseId,
        category: "reasoning",
        input: "",
        output: (previous?.output ?? "") + block.text,
        files: [],
        links: [],
        status: "Reported summary",
      });
    } else if (block.type === "reasoning_block" && block.summaryText) {
      const id = block.ctx.itemId ?? `summary:${index}`;
      actions.set(id, {
        id,
        name: "Reasoning summary",
        agent: block.ctx.agent || "Main agent",
        responseId: block.ctx.responseId,
        category: "reasoning",
        input: "",
        output: block.summaryText,
        files: [],
        links: [],
        status: "Reported summary",
      });
    }
  }
  return [...actions.values()];
}
