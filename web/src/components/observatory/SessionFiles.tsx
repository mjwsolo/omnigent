import { lazy, Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileDiffIcon, RefreshCwIcon } from "lucide-react";
import {
  useWorkspaceChangedFiles,
  useWorkspaceEnvironment,
  useWorkspaceServeable,
} from "@/hooks/useWorkspaceChangedFiles";
import { useFileDiff } from "@/hooks/useFileDiff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MonacoDiffViewer = lazy(() =>
  import("@/shell/MonacoDiffViewer").then((m) => ({ default: m.MonacoDiffViewer })),
);

export function SessionFiles({ conversationId }: { conversationId: string }) {
  const files = useWorkspaceChangedFiles(conversationId);
  const environment = useWorkspaceEnvironment(conversationId);
  const serveable = useWorkspaceServeable(conversationId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [layout, setLayout] = useState<"unified" | "split">("unified");
  const current = files.data?.data.find((f) => f.path === selectedPath);
  const diff = useFileDiff(conversationId, current ? selectedPath : null);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (selectedPath && files.dataUpdatedAt) {
      void queryClient.invalidateQueries({ queryKey: ["file-diff", conversationId, selectedPath] });
    }
  }, [conversationId, selectedPath, files.dataUpdatedAt, queryClient]);
  const unavailable = environment.data?.available === false || files.data?.available === false;
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Workspace changes</CardTitle>
            <Button
              variant="outline"
              size="sm"
              disabled={files.isFetching || serveable === false || unavailable}
              onClick={() => {
                void files.refetch();
              }}
            >
              <RefreshCwIcon className="size-3" />
              Refresh changes
            </Button>
          </div>
          <CardDescription>
            Saved changes reported by this session’s workspace. Select a file to compare its
            recorded baseline with current content. Other processes may also have edited these
            files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serveable === false ? (
            <p role="status" className="text-sm text-muted-foreground">
              Workspace is offline. Reconnect its host to inspect current changes.
            </p>
          ) : unavailable ? (
            <p role="status" className="text-sm text-muted-foreground">
              This session has no inspectable workspace.
            </p>
          ) : environment.isError || files.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load changes: {String(files.error?.message || environment.error?.message)}
            </p>
          ) : !files.data ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading workspace changes…
            </p>
          ) : files.data.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved workspace changes reported.</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-auto" aria-label="Changed files">
              {files.data.data.map((file) => (
                <li key={file.path}>
                  <Button
                    variant={selectedPath === file.path ? "secondary" : "ghost"}
                    className="h-auto w-full justify-start gap-3 py-3 text-left"
                    aria-label={`${file.path} ${file.status}`}
                    aria-pressed={selectedPath === file.path}
                    onClick={() => setSelectedPath(file.path)}
                  >
                    <FileDiffIcon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{file.path}</span>
                    <Badge variant="outline">{file.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {file.lines_added === null ? "?" : `+${file.lines_added}`} /{" "}
                      {file.lines_removed === null ? "?" : `−${file.lines_removed}`}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {selectedPath && (
        <Card>
          <CardHeader>
            <CardTitle className="break-all">{selectedPath}</CardTitle>
            <CardDescription>
              Before / after · updates when workspace changes arrive
            </CardDescription>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={layout === "unified" ? "secondary" : "outline"}
                aria-pressed={layout === "unified"}
                onClick={() => setLayout("unified")}
              >
                Inline diff
              </Button>
              <Button
                size="sm"
                variant={layout === "split" ? "secondary" : "outline"}
                aria-pressed={layout === "split"}
                onClick={() => setLayout("split")}
              >
                Side by side
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!current ? (
              <p className="text-sm text-muted-foreground">
                This path is no longer in the current change list.
              </p>
            ) : serveable === false ? (
              <p className="text-sm text-muted-foreground">
                Workspace is offline. Diff freshness cannot be confirmed.
              </p>
            ) : diff.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load diff: {diff.error.message}
              </p>
            ) : !diff.data ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading diff…
              </p>
            ) : (
              <div className="h-[45vh] min-h-64 overflow-hidden rounded-lg border">
                <Suspense
                  fallback={
                    <p role="status" className="p-4 text-sm text-muted-foreground">
                      Loading diff viewer…
                    </p>
                  }
                >
                  <MonacoDiffViewer
                    key={`${conversationId}:${selectedPath}`}
                    conversationId={conversationId}
                    before={diff.data.before}
                    after={diff.data.after}
                    path={selectedPath}
                    layout={layout}
                    hideWhitespace={false}
                    wrapLines={true}
                    comments={[]}
                    allowComments={false}
                    activeSelection={null}
                    onSetActiveSelection={() => {}}
                  />
                </Suspense>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
