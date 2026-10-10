import { useMemo, useState } from "react";
import { ActivityIcon, FileCodeIcon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "@/lib/routing";
import { useChatStore } from "@/store/chatStore";
import { observatoryModel, type ObservedAction } from "./observatoryModel";
import { SessionTasks } from "./SessionTasks";
import { SessionFiles } from "./SessionFiles";

export function SessionObservatory({ conversationId }: { conversationId: string }) {
  const [params, setParams] = useSearchParams();
  const open = params.get("observatory") === "1";
  const setOpen = (value: boolean) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set("observatory", "1");
        else next.delete("observatory");
        return next;
      },
      { replace: true },
    );
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Open session observatory">
          <ActivityIcon className="size-4" />
          <span className="hidden lg:inline">Observatory</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-6xl flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Session observatory</DialogTitle>
          <DialogDescription>
            Track the plan, inspect activity, and review workspace changes in this session.
          </DialogDescription>
        </DialogHeader>
        {open && <ObservatoryContent key={conversationId} conversationId={conversationId} />}
      </DialogContent>
    </Dialog>
  );
}

export function ObservatoryContent({ conversationId }: { conversationId: string }) {
  const activeId = useChatStore((s) => s.conversationId);
  const blocks = useChatStore((s) => s.blocks);
  const status = useChatStore((s) => s.sessionStatus);
  const blockedOn = useChatStore((s) => s.blockedOn);
  const hasMore = useChatStore((s) => s.hasMoreHistory);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pausedActions, setPausedActions] = useState<ObservedAction[] | null>(null);
  const liveActions = useMemo(() => observatoryModel(blocks), [blocks]);
  const actions = pausedActions ?? liveActions;
  const selected = actions.find((action) => action.id === selectedId);
  const filtered = actions.filter(
    (action) =>
      (filter === "all" || action.category === filter) &&
      `${action.name} ${action.input} ${action.output ?? ""} ${action.files.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const files = [...new Set(actions.flatMap((action) => action.files))];
  if (activeId !== conversationId)
    return (
      <p className="text-muted-foreground">
        Waiting for this session to load. No other session data is shown.
      </p>
    );
  return (
    <div className="min-h-0 space-y-4 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Session: {status}</Badge>
          <Badge variant="outline">
            {actions.filter((a) => a.category !== "reasoning").length} actions
          </Badge>
          <Badge variant="outline">{files.length} referenced files</Badge>
          {pausedActions && (
            <Badge variant="secondary">Activity paused · tasks and files stay live</Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPausedActions(pausedActions ? null : structuredClone(liveActions))}
        >
          {pausedActions ? "Resume view" : "Pause view"}
        </Button>
      </div>
      {blockedOn && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>{blockedOn}. Return to the session to respond.</CardDescription>
          </CardHeader>
        </Card>
      )}
      <Tabs defaultValue="activity">
        <TabsList aria-label="Observatory views">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="changes">File changes</TabsTrigger>
          <TabsTrigger value="files">File map</TabsTrigger>
        </TabsList>
        <TabsContent value="activity" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-48 flex-1">
              <SearchIcon className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                aria-label="Search observed actions"
                placeholder="Search tools, files, or output…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList aria-label="Activity categories">
                {["all", "tool", "web", "reasoning"].map((kind) => (
                  <TabsTrigger key={kind} value={kind}>
                    {kind === "all"
                      ? "All"
                      : kind === "tool"
                        ? "Tools"
                        : kind === "web"
                          ? "Web"
                          : "Summaries"}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="max-h-[48vh] space-y-2 overflow-y-auto" aria-label="Observed actions">
              {filtered
                .slice(-100)
                .reverse()
                .map((action) => (
                  <Button
                    key={action.id}
                    variant={selectedId === action.id ? "secondary" : "outline"}
                    className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                    onClick={() => setSelectedId(action.id)}
                    aria-pressed={selectedId === action.id}
                    aria-label={`${action.name} · ${action.agent} · ${action.status}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{action.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {action.agent} · {action.status}
                      </span>
                    </span>
                  </Button>
                ))}
              {filtered.length === 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>No matching observations</CardTitle>
                    <CardDescription>
                      Run a task in this session, or change the filter. Available events depend on
                      the harness.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
              {filtered.length > 100 && (
                <p className="text-xs text-muted-foreground">Showing the latest 100 matches.</p>
              )}
            </div>
            <ActionInspector action={selected} />
          </div>
        </TabsContent>
        <TabsContent value="tasks">
          <SessionTasks />
        </TabsContent>
        <TabsContent value="changes">
          <SessionFiles key={conversationId} conversationId={conversationId} />
        </TabsContent>
        <TabsContent value="files">
          <FileMap actions={actions} onSelect={setSelectedId} />
          <ActionInspector action={selected} />
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        {hasMore ? "Older history is not loaded. " : "Based on currently loaded history. "}File
        links mean explicit tool references, not verified writes or code dependencies. Tool output
        is evidence to inspect, not proof of correctness. Only reasoning exposed in the session
        transcript is shown; private reasoning is unavailable.
      </p>
    </div>
  );
}

function ActionInspector({ action }: { action?: ObservedAction }) {
  return (
    <Card className="min-w-0" size="sm">
      <CardHeader>
        <CardTitle>{action?.name ?? "Inspect an action"}</CardTitle>
        <CardDescription>
          {action
            ? `${action.agent} · ${action.status}`
            : "Select a tool call or a file to see its inputs and result."}
        </CardDescription>
      </CardHeader>
      {action && (
        <CardContent className="max-h-[42vh] space-y-3 overflow-y-auto">
          {action.input && (
            <section>
              <h3 className="mb-2 text-xs font-medium">Input</h3>
              <pre className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap wrap-anywhere">
                {action.input.slice(0, 24000)}
              </pre>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-xs font-medium">
              {action.category === "reasoning" ? "Reported summary" : "Output"}
            </h3>
            <pre className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap wrap-anywhere">
              {action.output === null
                ? "No result payload observed."
                : action.output.slice(0, 24000) || "Empty result payload."}
            </pre>
          </section>
          {action.links.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium">Observed links</h3>
              {action.links.map((url) => (
                <a
                  key={url}
                  className="block text-xs text-primary underline wrap-anywhere"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {url}
                </a>
              ))}
            </section>
          )}
          {(action.input.length > 24000 || (action.output?.length ?? 0) > 24000) && (
            <p className="text-xs text-muted-foreground">
              Preview capped at 24,000 characters per field. Use the transcript for the full result.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function FileMap({
  actions,
  onSelect,
}: {
  actions: ObservedAction[];
  onSelect: (id: string) => void;
}) {
  const linked = actions.filter((action) => action.files.length > 0).slice(-12);
  const files = [...new Set(linked.flatMap((action) => action.files))].sort().slice(0, 12);
  const height = Math.max(linked.length, files.length, 1) * 52 + 24;
  return (
    <Card className="mb-3" size="sm">
      <CardHeader>
        <CardTitle>Actions → referenced files</CardTitle>
        <CardDescription>
          Latest 12 file-related actions. Select a node to inspect the observation.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No explicit file paths observed in tool arguments yet.
          </p>
        ) : (
          <div className="relative min-w-[620px]" style={{ height }}>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 620 ${height}`}
              preserveAspectRatio="none"
            >
              {linked.flatMap((action, i) =>
                action.files
                  .filter((file) => files.includes(file))
                  .map((file) => (
                    <path
                      key={`${action.id}:${file}`}
                      d={`M 240 ${i * 52 + 22} C 305 ${i * 52 + 22}, 315 ${files.indexOf(file) * 52 + 22}, 380 ${files.indexOf(file) * 52 + 22}`}
                      fill="none"
                      className="stroke-border"
                      strokeWidth="2"
                    />
                  )),
              )}
            </svg>
            <div className="absolute left-0 top-0 w-[38%] space-y-3">
              {linked.map((action) => (
                <Button
                  key={action.id}
                  variant="outline"
                  className="h-10 w-full justify-start overflow-hidden"
                  onClick={() => onSelect(action.id)}
                >
                  <ActivityIcon className="size-4 shrink-0" />
                  <span className="truncate">{action.name}</span>
                </Button>
              ))}
            </div>
            <div className="absolute right-0 top-0 w-[38%] space-y-3">
              {files.map((file) => (
                <Button
                  key={file}
                  variant="secondary"
                  className="h-10 w-full justify-start overflow-hidden"
                  title={file}
                  onClick={() => {
                    const action = [...linked].reverse().find((a) => a.files.includes(file));
                    if (action) onSelect(action.id);
                  }}
                >
                  <FileCodeIcon className="size-4 shrink-0" />
                  <span className="truncate">{file}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
