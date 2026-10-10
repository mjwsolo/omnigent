import { CheckCircle2Icon, CircleDotIcon, CircleIcon } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SessionTasks() {
  const todos = useChatStore((s) => s.todos);
  const occurrences = new Map<string, number>();
  const tasks = todos.map((task) => {
    const occurrence = occurrences.get(task.content) ?? 0;
    occurrences.set(task.content, occurrence + 1);
    return { ...task, key: JSON.stringify([task.content, occurrence]) };
  });
  const completed = todos.filter((task) => task.status === "completed").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent plan</CardTitle>
        <CardDescription>
          Live task status reported by this session’s harness. Reported completion is separate from
          a verified result.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {todos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No task plan has been reported. Tool activity alone does not establish a plan.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span>
                {completed} of {todos.length} tasks reported complete
              </span>
              <Badge variant="secondary">Live plan</Badge>
            </div>
            <progress
              className="h-2 w-full accent-primary"
              value={completed}
              max={todos.length}
              aria-label="Reported task completion"
            />
            <ol className="space-y-2" aria-label="Agent tasks">
              {tasks.map((task) => {
                const Icon =
                  task.status === "completed"
                    ? CheckCircle2Icon
                    : task.status === "in_progress"
                      ? CircleDotIcon
                      : CircleIcon;
                return (
                  <li key={task.key} className="flex items-start gap-3 rounded-lg border p-3">
                    <Icon
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm break-words">{task.content}</p>
                      {task.status === "in_progress" &&
                        task.activeForm &&
                        task.activeForm !== task.content && (
                          <p className="mt-1 text-xs text-muted-foreground">{task.activeForm}</p>
                        )}
                    </div>
                    <Badge variant="outline">
                      {task.status === "in_progress"
                        ? "In progress"
                        : task.status === "completed"
                          ? "Reported complete"
                          : "Pending"}
                    </Badge>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}
