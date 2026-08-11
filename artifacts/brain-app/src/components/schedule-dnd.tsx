import { useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Check,
  Edit2,
  Trash2,
  CalendarPlus,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScheduleTask } from "@workspace/api-client-react";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
type Quarter = (typeof QUARTERS)[number];

const QUARTER_LABELS: Record<Quarter, string> = {
  Q1: "Q1 — Morning (0600-1200)",
  Q2: "Q2 — Afternoon (1200-1800)",
  Q3: "Q3 — Evening (1800-2200)",
  Q4: "Q4 — Night (2200-0600)",
};

function groupByQuarter(tasks: ScheduleTask[]): Record<Quarter, ScheduleTask[]> {
  const result: Record<Quarter, ScheduleTask[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
  for (const task of tasks) result[task.quarter as Quarter].push(task);
  for (const q of QUARTERS) result[q].sort((a, b) => a.order - b.order);
  return result;
}

function findContainer(id: string, items: Record<Quarter, ScheduleTask[]>): Quarter | null {
  if ((QUARTERS as readonly string[]).includes(id)) return id as Quarter;
  for (const q of QUARTERS) {
    if (items[q].some((t) => String(t.id) === id)) return q;
  }
  return null;
}

interface TaskCardProps {
  task: ScheduleTask;
  dragHandleProps?: Record<string, unknown>;
  isDragOverlay?: boolean;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  isTitleEditing: boolean;
  titleEditValue: string;
  onTitleEditValueChange: (v: string) => void;
  onTitleEditStart: () => void;
  onTitleEditSave: () => void;
  onTitleEditCancel: () => void;
  onComplete: () => void;
  onUncomplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCalendar: () => void;
  calSyncing: boolean;
}

function TaskCard({
  task,
  dragHandleProps,
  isDragOverlay,
  isEditing,
  editValue,
  onEditValueChange,
  onEditStart,
  onEditSave,
  onEditCancel,
  isTitleEditing,
  titleEditValue,
  onTitleEditValueChange,
  onTitleEditStart,
  onTitleEditSave,
  onTitleEditCancel,
  onComplete,
  onUncomplete,
  onEdit,
  onDelete,
  onCalendar,
  calSyncing,
}: TaskCardProps) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-3 border-b border-border/50 bg-card hover:bg-secondary/20 transition-colors ${
        isDragOverlay ? "shadow-lg ring-1 ring-primary/30 rounded-sm opacity-95" : ""
      }`}
    >
      <div
        {...dragHandleProps}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0 touch-none"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="w-16 shrink-0">
        {isEditing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onBlur={onEditSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEditSave();
              if (e.key === "Escape") onEditCancel();
            }}
            className="w-full text-xs font-bold bg-transparent border-b border-primary focus:outline-none text-foreground"
          />
        ) : (
          <span
            className="text-xs font-bold cursor-pointer hover:text-primary hover:underline"
            title="Click to edit time"
            onClick={onEditStart}
          >
            {task.timeLabel}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {isTitleEditing ? (
          <input
            autoFocus
            value={titleEditValue}
            onChange={(e) => onTitleEditValueChange(e.target.value)}
            onBlur={onTitleEditSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") onTitleEditSave();
              if (e.key === "Escape") onTitleEditCancel();
            }}
            className="w-full font-display text-sm tracking-wider bg-transparent border-b border-primary focus:outline-none text-foreground"
          />
        ) : (
          <span
            className="font-display text-sm tracking-wider truncate block cursor-pointer hover:text-primary hover:underline"
            title="Click to edit title"
            onClick={onTitleEditStart}
          >
            {task.title}
          </span>
        )}
      </div>

      <div className="shrink-0">
        {task.isCompleted ? (
          <Badge
            variant="success"
            className="text-xs cursor-pointer hover:bg-muted hover:text-muted-foreground transition-colors"
            title="Tap to mark pending"
            onClick={onUncomplete}
          >
            Done
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-xs cursor-pointer hover:bg-success/20 hover:text-success hover:border-success/50 transition-colors"
            title="Tap to mark done"
            onClick={onComplete}
          >
            Pending
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7 text-primary/60 hover:text-primary hover:bg-primary/10 border-primary/20"
          title="Push to Calendar"
          disabled={calSyncing}
          onClick={onCalendar}
        >
          {calSyncing ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <CalendarPlus className="h-3 w-3" />
          )}
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7"
          title="Edit details"
          onClick={onEdit}
        >
          <Edit2 className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="destructive"
          className="h-7 w-7"
          title="Delete"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

interface SortableTaskCardProps extends Omit<TaskCardProps, "dragHandleProps"> {
  task: ScheduleTask;
}

function SortableTaskCard({ task, ...rest }: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(task.id) });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard
        task={task}
        dragHandleProps={{ ...attributes, ...listeners } as Record<string, unknown>}
        {...rest}
      />
    </div>
  );
}

interface QuarterDropZoneProps {
  quarter: Quarter;
  children: React.ReactNode;
}

function QuarterDropZone({ quarter, children }: QuarterDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: quarter });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[56px] transition-colors rounded-b-sm ${isOver ? "bg-primary/5" : ""}`}
    >
      {children}
    </div>
  );
}

export interface ScheduleTabDnDProps {
  schedule: ScheduleTask[] | undefined;
  updateTask: (vars: { id: number; data: { quarter?: "Q1" | "Q2" | "Q3" | "Q4"; order?: number; timeLabel?: string; title?: string } }) => void;
  completeTask: (vars: { id: number }) => void;
  uncompleteTask: (vars: { id: number }) => void;
  deleteTask: (vars: { id: number }) => void;
  onEdit: (task: ScheduleTask) => void;
  onCalendar: (task: ScheduleTask) => void;
  calSyncingId: number | null;
}

export function ScheduleTabDnD({
  schedule,
  updateTask,
  completeTask,
  uncompleteTask,
  deleteTask,
  onEdit,
  onCalendar,
  calSyncingId,
}: ScheduleTabDnDProps) {
  const [items, setItems] = useState<Record<Quarter, ScheduleTask[]>>(() =>
    groupByQuarter(schedule ?? [])
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState("");
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");

  useEffect(() => {
    if (!activeId) setItems(groupByQuarter(schedule ?? []));
  }, [schedule, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setEditingTimeId(null);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeContainer = findContainer(activeId, items);
    const overContainer = findContainer(overId, items);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setItems((prev) => {
      const activeTasks = prev[activeContainer];
      const overTasks = prev[overContainer];
      const taskIdx = activeTasks.findIndex((t) => String(t.id) === activeId);
      const task = activeTasks[taskIdx];
      const overIdx = overTasks.findIndex((t) => String(t.id) === overId);
      const insertAt = overIdx >= 0 ? overIdx : overTasks.length;

      return {
        ...prev,
        [activeContainer]: activeTasks.filter((_, i) => i !== taskIdx),
        [overContainer]: [
          ...overTasks.slice(0, insertAt),
          task,
          ...overTasks.slice(insertAt),
        ],
      };
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeContainer = findContainer(activeId, items);
    const overContainer = findContainer(overId, items);
    if (!activeContainer) return;

    let finalItems = items;

    if (activeContainer === overContainer) {
      const oldIdx = items[activeContainer].findIndex((t) => String(t.id) === activeId);
      const newIdx = items[activeContainer].findIndex((t) => String(t.id) === overId);
      if (oldIdx !== newIdx && newIdx >= 0) {
        const newArr = arrayMove(items[activeContainer], oldIdx, newIdx);
        finalItems = { ...items, [activeContainer]: newArr };
        setItems(finalItems);
      }
    }

    for (const q of QUARTERS) {
      finalItems[q].forEach((task, idx) => {
        const orig = schedule?.find((t) => t.id === task.id);
        if (!orig || orig.order !== idx || orig.quarter !== q) {
          updateTask({ id: task.id, data: { order: idx, quarter: q } });
        }
      });
    }
  };

  const activeTask = activeId
    ? Object.values(items).flat().find((t) => String(t.id) === activeId)
    : null;

  const saveTime = (task: ScheduleTask) => {
    const trimmed = editingTimeValue.trim();
    if (trimmed && trimmed !== task.timeLabel) {
      updateTask({ id: task.id, data: { timeLabel: trimmed } });
    }
    setEditingTimeId(null);
  };

  const saveTitle = (task: ScheduleTask) => {
    const trimmed = editingTitleValue.trim();
    if (trimmed && trimmed !== task.title) {
      updateTask({ id: task.id, data: { title: trimmed } });
    }
    setEditingTitleId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-8">
        {QUARTERS.map((q) => (
          <Card key={q}>
            <CardHeader className="bg-secondary/50 py-3">
              <CardTitle className="text-xl font-display tracking-widest">
                {QUARTER_LABELS[q]}
              </CardTitle>
            </CardHeader>
            <SortableContext
              items={items[q].map((t) => String(t.id))}
              strategy={verticalListSortingStrategy}
            >
              <QuarterDropZone quarter={q}>
                {items[q].length === 0 ? (
                  <p className="px-6 py-5 text-muted-foreground italic text-sm">
                    No tasks — drag one here or add a new task.
                  </p>
                ) : (
                  items[q].map((task) => (
                    <SortableTaskCard
                      key={task.id}
                      task={task}
                      isEditing={editingTimeId === task.id}
                      editValue={editingTimeValue}
                      onEditValueChange={setEditingTimeValue}
                      onEditStart={() => {
                        setEditingTimeId(task.id);
                        setEditingTimeValue(task.timeLabel);
                        setEditingTitleId(null);
                      }}
                      onEditSave={() => saveTime(task)}
                      onEditCancel={() => setEditingTimeId(null)}
                      isTitleEditing={editingTitleId === task.id}
                      titleEditValue={editingTitleValue}
                      onTitleEditValueChange={setEditingTitleValue}
                      onTitleEditStart={() => {
                        setEditingTitleId(task.id);
                        setEditingTitleValue(task.title);
                        setEditingTimeId(null);
                      }}
                      onTitleEditSave={() => saveTitle(task)}
                      onTitleEditCancel={() => setEditingTitleId(null)}
                      onComplete={() => completeTask({ id: task.id })}
                      onUncomplete={() => uncompleteTask({ id: task.id })}
                      onEdit={() => onEdit(task)}
                      onDelete={() => {
                        if (confirm("Delete task?")) deleteTask({ id: task.id });
                      }}
                      onCalendar={() => onCalendar(task)}
                      calSyncing={calSyncingId === task.id}
                    />
                  ))
                )}
              </QuarterDropZone>
            </SortableContext>
          </Card>
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            isDragOverlay
            isEditing={false}
            editValue=""
            onEditValueChange={() => {}}
            onEditStart={() => {}}
            onEditSave={() => {}}
            onEditCancel={() => {}}
            isTitleEditing={false}
            titleEditValue=""
            onTitleEditValueChange={() => {}}
            onTitleEditStart={() => {}}
            onTitleEditSave={() => {}}
            onTitleEditCancel={() => {}}
            onComplete={() => {}}
            onUncomplete={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
            onCalendar={() => {}}
            calSyncing={false}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
