import { useMemo, useState } from "react";
import {
  ActivityIcon,
  ArrowUpRightIcon,
  InboxIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { useConversations, type Conversation } from "@/hooks/useConversations";
import { useSessionUpdatesConnected } from "@/hooks/useSessionUpdatesConnected";
import { PageScroll } from "@/components/PageScroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/lib/routing";

export function fleetStatus(session: Conversation): string {
  if ((session.pending_elicitations_count ?? 0) > 0) return "Needs response";
  if (session.status === "failed") return "Failed";
  if (session.runner_online === false) return "Runner offline";
  if (session.status === "running") return "Running";
  if (session.status === "idle") return "Idle";
  return "Unknown";
}
const needsAttention = (s: Conversation) =>
  (s.pending_elicitations_count ?? 0) > 0 || s.status === "failed";
const workspaceName = (s: Conversation) =>
  s.labels.omni_project || s.workspace?.split(/[\\/]/).filter(Boolean).at(-1) || "No workspace";

export function AgentsPage() {
  const query = useConversations("", false, { reconcileWhileConnected: true });
  const connected = useSessionUpdatesConnected();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const rows = useMemo(() => {
    const seen = new Map<string, Conversation>();
    for (const page of query.data?.pages ?? [])
      for (const row of page.data) if (!row.archived) seen.set(row.id, row);
    return [...seen.values()];
  }, [query.data]);
  const filtered = rows.filter(
    (s) =>
      (filter !== "attention" || needsAttention(s)) &&
      (filter !== "running" || fleetStatus(s) === "Running") &&
      [s.title, s.agent_name, s.owner, s.workspace, workspaceName(s), s.host_id]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const attention = rows.filter(needsAttention).length;
  return (
    <PageScroll maxWidthClassName="max-w-7xl" contentClassName="px-4 sm:px-8">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Agent management
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              See the work. Know what needs you.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Your accessible Omnigent sessions, together. Open a session to track its plan, tools,
              reasoning, and file changes.
            </p>
          </div>
          <Button asChild>
            <Link to="/">
              <PlusIcon className="size-4" />
              New session
            </Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Loaded sessions", value: rows.length, Icon: LayersIcon },
            {
              label: "Running",
              value: rows.filter((s) => fleetStatus(s) === "Running").length,
              Icon: ActivityIcon,
            },
            { label: "Needs attention", value: attention, Icon: InboxIcon },
          ].map(({ label, value, Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-4 pt-4">
                <Icon className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList aria-label="Agent status filter">
              <TabsTrigger value="all">All sessions</TabsTrigger>
              <TabsTrigger value="attention">Needs attention</TabsTrigger>
              <TabsTrigger value="running">Running</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative min-w-52 sm:w-80">
            <SearchIcon className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              aria-label="Search loaded sessions"
              placeholder="Search task, agent, owner, or project…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {query.isError && (
          <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">
            Could not refresh sessions. {query.error.message}
            <Button
              variant="outline"
              size="sm"
              className="ml-3"
              onClick={() => void query.refetch()}
            >
              Retry
            </Button>
          </div>
        )}
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Session / agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>
                  <span className="sr-only">Inspect</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-80 py-4 pl-4">
                    <Link
                      to={`/c/${encodeURIComponent(s.id)}?observatory=1`}
                      className="block truncate font-medium hover:underline"
                    >
                      {s.title || "Untitled session"}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.agent_name || "Agent not reported"}
                      {s.parent_session_id ? " · Subagent" : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={needsAttention(s) ? "secondary" : "outline"}>
                      {fleetStatus(s)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-48 truncate" title={s.workspace ?? undefined}>
                    {workspaceName(s)}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-muted-foreground">
                    {s.owner || "Not reported"}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                    {s.host_id || "Not host-bound"}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="icon">
                      <Link
                        to={`/c/${encodeURIComponent(s.id)}?observatory=1`}
                        aria-label={`Inspect ${s.title || s.id}`}
                      >
                        <ArrowUpRightIcon className="size-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {query.isLoading ? (
            <p role="status" className="p-12 text-center text-sm text-muted-foreground">
              Loading sessions…
            </p>
          ) : (
            !filtered.length && (
              <div className="space-y-2 p-12 text-center">
                <h2 className="font-medium">
                  {rows.length ? "No matching sessions" : "Your agents’ work will appear here"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {rows.length
                    ? "Try another search or status filter."
                    : "Start a session in Omnigent or connect a native harness through its host."}
                </p>
              </div>
            )
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
            <span>
              {filtered.length} shown · {rows.length} loaded
              {query.hasNextPage ? " · More sessions available" : ""}
            </span>
            <span>
              {connected
                ? "Session updates connected"
                : "Live updates disconnected · polling for changes"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline">
            <Link to="/inbox">
              <InboxIcon className="size-4" />
              Open approvals inbox
            </Link>
          </Button>
          {query.hasNextPage && (
            <Button
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more sessions"}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Counts and search cover loaded sessions. Idle means no active turn, not verified task
          completion. Externally launched sessions require a connected adapter; a harness name alone
          does not establish access or control.
        </p>
      </div>
    </PageScroll>
  );
}
