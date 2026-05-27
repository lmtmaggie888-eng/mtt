"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  buildMonthRows,
  expandRoutinesToTasks,
  formatCalendarTaskTitle,
  formatDateLabel,
  formatMonthLabel,
  formatRelativeDateText,
  formatWeekdayOnly,
  getCategoryLabel,
  getTodayIso,
  isSameDay,
  listMonthAnchors,
  parseQuickInput,
  sortDayTasks,
} from "@/lib/workbench-utils";
import type {
  Routine,
  Task,
  TaskCategory,
  ViewMode,
  WeeklyBoardEntry,
  WeeklyBoardItem,
  WeeklyBoardSection,
} from "@/lib/workbench-types";

const categoryOrder: TaskCategory[] = ["work", "sideBusiness", "buy", "life", "idea"];
const weekSectionLabels: Record<WeeklyBoardSection, string> = {
  monthSyncedTodo: "同步月历 Todo",
  overallRoutine: "本周总控",
  workTodo: "本周工作",
  sideBusinessPlan: "本周副业",
};
const monthHeaders = [
  { label: "周二", isRest: false },
  { label: "周三", isRest: false },
  { label: "周四", isRest: false },
  { label: "周五", isRest: false },
  { label: "周六", isRest: false },
  { label: "周日", isRest: true },
  { label: "周一", isRest: true },
];
const routineOrder = ["weekly", "monthly"] as const;

type EditingDraft = {
  id: string;
  title: string;
  category: TaskCategory;
  scheduledTimeText: string;
};

export function Workbench() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineDrafts, setRoutineDrafts] = useState<Routine[]>([]);
  const [weeklyBoardItems, setWeeklyBoardItems] = useState<WeeklyBoardItem[]>([]);
  const [weeklyBoardEntries, setWeeklyBoardEntries] = useState<WeeklyBoardEntry[]>([]);
  const [view, setView] = useState<ViewMode>("month");
  const [anchorDate, setAnchorDate] = useState(getTodayIso());
  const [selectedDate, setSelectedDate] = useState(getTodayIso());
  const [quickInput, setQuickInput] = useState("明天下午给 shenyu 回合作报价");
  const [message, setMessage] = useState("这里模拟微信录入。写了具体日期的任务会自动进月历和周历，没写日期的先留在待办池。");
  const [isLoading, setIsLoading] = useState(true);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<EditingDraft | null>(null);

  useEffect(() => {
    void refreshAll();
  }, []);

  const monthAnchors = listMonthAnchors(anchorDate, 3);
  const routineTasks = useMemo(() => expandRoutinesToTasks(routines, monthAnchors), [routines, monthAnchors]);
  const allTasks = useMemo(() => [...routineTasks, ...tasks], [routineTasks, tasks]);
  const workWeekDays = useMemo(() => buildWorkWeekDays(anchorDate), [anchorDate]);
  const todayIso = getTodayIso();

  const groupedPool = useMemo(
    () =>
      categoryOrder.map((category) => ({
        category,
        tasks: tasks.filter((task) => !task.scheduledDate && task.category === category),
      })),
    [tasks],
  );

  const selectedDayTasks = useMemo(
    () => sortDayTasks(allTasks.filter((task) => task.scheduledDate && isSameDay(task.scheduledDate, selectedDate))),
    [allTasks, selectedDate],
  );

  const summary = useMemo(
    () => ({
      today: allTasks.filter((task) => task.scheduledDate && isSameDay(task.scheduledDate, todayIso) && task.status === "open").length,
      overdue: allTasks.filter((task) => task.source !== "routine" && task.scheduledDate && task.scheduledDate < todayIso && task.status === "open").length,
      unscheduled: tasks.filter((task) => !task.scheduledDate && task.status === "open").length,
    }),
    [allTasks, tasks, todayIso],
  );

  async function refreshAll() {
    setIsLoading(true);
    const [taskResponse, routineResponse, weeklyBoardResponse] = await Promise.all([
      fetch("/api/tasks", { cache: "no-store" }),
      fetch("/api/routines", { cache: "no-store" }),
      fetch("/api/weekly-board", { cache: "no-store" }),
    ]);

    const taskPayload = (await taskResponse.json()) as { tasks: Task[] };
    const routinePayload = (await routineResponse.json()) as { routines: Routine[] };
    const weeklyPayload = (await weeklyBoardResponse.json()) as {
      items: WeeklyBoardItem[];
      entries: WeeklyBoardEntry[];
    };

    setTasks(taskPayload.tasks);
    setRoutines(routinePayload.routines);
    setRoutineDrafts(routinePayload.routines);
    setWeeklyBoardItems(weeklyPayload.items);
    setWeeklyBoardEntries(weeklyPayload.entries);
    setIsLoading(false);
  }

  async function toggleTask(taskId: string) {
    if (taskId.startsWith("routine-task-")) return;
    await fetch(`/api/tasks/${taskId}/complete`, { method: "POST" });
    await refreshAll();
  }

  async function quickAddTask() {
    const parsed = parseQuickInput(quickInput, anchorDate);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: quickInput,
        openId: "web-preview-user",
        anchorDate,
      }),
    });
    await refreshAll();
    setMessage(
      parsed.scheduledDate
        ? `已记录到「${getCategoryLabel(parsed.category)}」，并自动安排到 ${formatRelativeDateText(parsed.scheduledDate, parsed.scheduledTimeText)}`
        : `已记录到「${getCategoryLabel(parsed.category)}」，先放进待办池，等你之后再安排`,
    );
    setQuickInput("");
  }

  async function assignTaskToDate(taskId: string, targetDate: string) {
    if (taskId.startsWith("routine-task-")) return;
    await fetch(`/api/tasks/${taskId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledDate: targetDate }),
    });
    await refreshAll();
    setSelectedDate(targetDate);
    setMessage(`任务已安排到 ${targetDate}`);
  }

  async function unscheduleTask(taskId: string) {
    if (taskId.startsWith("routine-task-")) return;
    await fetch(`/api/tasks/${taskId}/unschedule`, { method: "POST" });
    await refreshAll();
    setMessage("任务已移回待办池");
  }

  async function removeTask(taskId: string) {
    if (taskId.startsWith("routine-task-")) return;
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    await refreshAll();
    setMessage("任务已删除");
  }

  function beginEdit(task: Task) {
    if (task.source === "routine") return;
    setEditingDraft({
      id: task.id,
      title: task.title,
      category: task.category,
      scheduledTimeText: task.scheduledTimeText ?? "",
    });
  }

  async function saveEdit() {
    if (!editingDraft) return;

    await fetch(`/api/tasks/${editingDraft.id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingDraft),
    });
    await refreshAll();
    setEditingDraft(null);
    setMessage("任务内容已更新");
  }

  async function saveRoutines() {
    await fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routines: routineDrafts }),
    });
    await refreshAll();
    setMessage("固定事项已更新，月历和周历都会同步");
  }

  async function saveWeeklyBoardEntry(itemId: string, date: string, content: string) {
    const trimmed = content.trim();
    const nextEntries = updateWeeklyBoardEntriesState(weeklyBoardEntries, itemId, date, trimmed);
    setWeeklyBoardEntries(nextEntries);
    await fetch("/api/weekly-board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: nextEntries }),
    });
  }

  function shiftAnchor(days: number) {
    setAnchorDate(addDays(anchorDate, days));
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-4 px-4 py-3 md:px-6 lg:px-8">
        <section className="grid gap-3 rounded-[24px] border border-white/70 bg-white/85 p-3 shadow-[0_14px_40px_rgba(171,135,104,0.10)] backdrop-blur xl:grid-cols-[0.8fr_1.35fr_0.9fr] xl:items-center">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">微信录入工作台</p>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--ink)] md:text-2xl">微信待办台</h1>
            <p className="text-xs leading-5 text-[var(--soft-ink)]">
              写日期就进日历，没写日期就留在待办池。周历前半同步，后半单独规划。
            </p>
          </div>
          <div className="grid gap-2 rounded-[20px] bg-[var(--panel)] p-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">网页模拟微信录入</p>
              <div className="mt-2 rounded-[18px] border border-[var(--line)] bg-white p-3 shadow-sm">
                <textarea
                  className="min-h-20 w-full resize-none border-0 bg-transparent text-sm leading-6 text-[var(--ink)] outline-none"
                  value={quickInput}
                  onChange={(event) => setQuickInput(event.target.value)}
                  placeholder="像在微信聊天框里那样输入一句话"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="soft-button soft-button-primary" onClick={quickAddTask} type="button">
                记一条
              </button>
              <span className="text-xs leading-5 text-[var(--soft-ink)]">{isLoading ? "正在同步任务..." : message}</span>
            </div>
          </div>
          <div className="rounded-[20px] border border-white/70 bg-white/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">提醒</p>
                <p className="mt-1 text-xs leading-5 text-[var(--soft-ink)]">
                  每天 8:30 提醒，每周二补提醒待安排事项。
                </p>
              </div>
              <div className="grid min-w-[300px] gap-2 sm:grid-cols-3">
              <SummaryCard label="今天待办" value={summary.today} accent="var(--rose)" />
              <SummaryCard label="逾期待办" value={summary.overdue} accent="var(--sand)" />
              <SummaryCard label="待安排" value={summary.unscheduled} accent="var(--mist)" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,2.35fr)_360px]">
          <div className="rounded-[24px] border border-white/70 bg-white/90 p-3 shadow-[0_20px_56px_rgba(186,166,149,0.14)] md:p-4">
            <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">主视图</p>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold text-[var(--ink)]">{formatMonthLabel(anchorDate)}</h2>
                  <span className="rounded-full bg-[var(--warm)] px-3 py-1 text-xs font-medium text-[var(--ink)]">
                    月历按“周二到周一”排序，只显示当前月
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="soft-button" onClick={() => shiftAnchor(-30)} type="button">
                  上个月
                </button>
                <div className="segmented-control">
                  {(["month", "week", "today", "routine"] as ViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={mode === view ? "segmented-active" : ""}
                      onClick={() => setView(mode)}
                      type="button"
                    >
                      {mode === "month" ? "月历" : mode === "week" ? "周历" : mode === "today" ? "今天" : "Routine"}
                    </button>
                  ))}
                </div>
                <button className="soft-button" onClick={() => shiftAnchor(30)} type="button">
                  下个月
                </button>
              </div>
            </header>

            {view === "month" ? (
              <MonthBoard
                monthAnchors={monthAnchors}
                tasks={allTasks}
                routines={routines}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                draggingTaskId={draggingTaskId}
                onDragStart={setDraggingTaskId}
                onDragEnd={() => setDraggingTaskId(null)}
                onAssignDroppedTask={assignTaskToDate}
                onToggleTask={toggleTask}
                onEditTask={beginEdit}
                onDeleteTask={removeTask}
              />
            ) : null}

            {view === "week" ? (
              <WeeklyPlannerBoard
                days={workWeekDays}
                tasks={allTasks}
                routines={routines}
                items={weeklyBoardItems}
                entries={weeklyBoardEntries}
                onToggleTask={toggleTask}
                onEditTask={beginEdit}
                onDeleteTask={removeTask}
                onSaveEntry={saveWeeklyBoardEntry}
              />
            ) : null}

            {view === "today" ? (
              <TodayPanel
                tasks={allTasks}
                todayIso={todayIso}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onToggle={toggleTask}
              />
            ) : null}

            {view === "routine" ? (
              <RoutinePanel routines={routineDrafts} setRoutines={setRoutineDrafts} onSave={saveRoutines} />
            ) : null}
          </div>

          <aside className="flex flex-col gap-4">
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_24px_64px_rgba(186,166,149,0.16)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">当天详情</p>
                  <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">{formatDateLabel(selectedDate)}</h3>
                </div>
                <button className="soft-button" onClick={() => setSelectedDate(todayIso)} type="button">
                  回到今天
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {selectedDayTasks.length === 0 ? (
                  <EmptyState text="这一天还没有安排事项，可以从下方待办池拖进去。" />
                ) : (
                  selectedDayTasks.map((task) => (
                    <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} routineColor={getRoutineColor(task, routines)} />
                  ))
                )}
              </div>
            </section>

            <section
              className={[
                "rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_24px_64px_rgba(186,166,149,0.16)]",
                draggingTaskId ? "pool-drop-active" : "",
              ].join(" ")}
              onDragOver={(event) => event.preventDefault()}
              onDrop={async (event) => {
                event.preventDefault();
                if (draggingTaskId) {
                  await unscheduleTask(draggingTaskId);
                }
              }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">待办池</p>
                <span className="text-xs text-[var(--soft-ink)]">拖回这里可以取消日期</span>
              </div>
              <div className="mt-4 space-y-4">
                {groupedPool.map(({ category, tasks: poolTasks }) => (
                  <div key={category} className="rounded-[22px] bg-[var(--panel)] p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-[var(--ink)]">{getCategoryLabel(category)}</h4>
                      <span className="text-xs text-[var(--muted)]">{poolTasks.length} 项</span>
                    </div>
                    <div className="space-y-2">
                      {poolTasks.length === 0 ? (
                        <EmptyState text="这里已经清空了。" compact />
                      ) : (
                        poolTasks.map((task) => (
                          <div
                            key={task.id}
                            className="cursor-grab rounded-[18px] border border-[var(--line)] bg-white p-3 active:cursor-grabbing"
                            draggable
                            onDragStart={() => setDraggingTaskId(task.id)}
                            onDragEnd={() => setDraggingTaskId(null)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-[var(--ink)]">{task.title}</p>
                                {task.collaboratorName ? (
                                  <p className="text-xs text-[var(--soft-ink)]">副业合作：{task.collaboratorName}</p>
                                ) : null}
                              </div>
                              <div className="flex gap-2">
                                <button className="soft-button compact-button" onClick={() => beginEdit(task)} type="button">
                                  编辑
                                </button>
                                <button className="soft-button danger-button compact-button" onClick={() => removeTask(task.id)} type="button">
                                  删除
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>

        {editingDraft ? (
          <section className="rounded-[28px] border border-white/70 bg-white/95 p-4 shadow-[0_24px_64px_rgba(186,166,149,0.16)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">编辑任务</p>
                <input
                  className="inline-editor-input"
                  value={editingDraft.title}
                  onChange={(event) => setEditingDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">分类</p>
                <select
                  className="inline-editor-select"
                  value={editingDraft.category}
                  onChange={(event) =>
                    setEditingDraft((current) =>
                      current ? { ...current, category: event.target.value as TaskCategory } : current,
                    )
                  }
                >
                  {categoryOrder.map((category) => (
                    <option key={category} value={category}>
                      {getCategoryLabel(category)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">时间备注</p>
                <input
                  className="inline-editor-input"
                  placeholder="例如：下午 / 10:00"
                  value={editingDraft.scheduledTimeText}
                  onChange={(event) =>
                    setEditingDraft((current) => (current ? { ...current, scheduledTimeText: event.target.value } : current))
                  }
                />
              </div>
              <div className="flex gap-2">
                <button className="soft-button" onClick={() => setEditingDraft(null)} type="button">
                  取消
                </button>
                <button className="soft-button soft-button-primary" onClick={saveEdit} type="button">
                  保存
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function MonthBoard({
  monthAnchors,
  tasks,
  routines,
  selectedDate,
  onSelectDate,
  draggingTaskId,
  onDragStart,
  onDragEnd,
  onAssignDroppedTask,
  onToggleTask,
  onEditTask,
  onDeleteTask,
}: {
  monthAnchors: string[];
  tasks: Task[];
  routines: Routine[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  draggingTaskId: string | null;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  onAssignDroppedTask: (taskId: string, targetDate: string) => Promise<void>;
  onToggleTask: (taskId: string) => Promise<void>;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => Promise<void>;
}) {
  return (
    <div className="mt-4 space-y-6">
      {monthAnchors.map((monthAnchor) => {
        const rows = buildMonthRows(monthAnchor);

        return (
          <section key={monthAnchor} className="rounded-[28px] border border-[var(--line)] bg-[#fffdfa] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[var(--ink)]">{formatMonthLabel(monthAnchor)}</h3>
              <span className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">当前月独立月历</span>
            </div>

            <div className="calendar-grid month-header">
              {monthHeaders.map((header) => (
                <div key={header.label} className={header.isRest ? "calendar-weekday rest-day" : "calendar-weekday"}>
                  <span>{header.label}</span>
                  {header.isRest ? <span className="calendar-weekday-tag">休息</span> : null}
                </div>
              ))}
            </div>

            <div className="month-rows">
              {rows.map((row, rowIndex) => (
                <div key={`${monthAnchor}-row-${rowIndex}`} className="calendar-grid month-row">
                  {row.map((date, colIndex) => {
                    if (!date) {
                      return <div key={`${monthAnchor}-empty-${rowIndex}-${colIndex}`} className="month-empty-cell" />;
                    }

                    const dayTasks = sortDayTasks(tasks.filter((task) => task.scheduledDate && isSameDay(task.scheduledDate, date)));
                    const isSelected = date === selectedDate;
                    const dayIndex = new Date(`${date}T00:00:00`).getDay();
                    const isRestDay = dayIndex === 0 || dayIndex === 1;

                    return (
                      <div
                        key={date}
                        className={[
                          "calendar-cell",
                          "month-board-cell",
                          isSelected ? "selected" : "",
                          isRestDay ? "rest-day" : "",
                          draggingTaskId ? "drop-target" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => onSelectDate(date)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={async (event) => {
                          event.preventDefault();
                          if (draggingTaskId) {
                            await onAssignDroppedTask(draggingTaskId, date);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="calendar-cell-header">
                          <span>{date.slice(8)}</span>
                          <span>{date === getTodayIso() ? "今天" : ""}</span>
                        </div>
                        <div className="calendar-task-list">
                          {dayTasks.length === 0 ? (
                            <span className="calendar-empty" />
                          ) : (
                            dayTasks.map((task) => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                routineColor={getRoutineColor(task, routines)}
                                onToggle={() => onToggleTask(task.id)}
                                onEdit={() => onEditTask(task)}
                                onDelete={task.source === "routine" ? undefined : () => onDeleteTask(task.id)}
                                onDragStart={task.source === "routine" ? undefined : () => onDragStart(task.id)}
                                onDragEnd={onDragEnd}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function WeeklyPlannerBoard({
  days,
  tasks,
  routines,
  items,
  entries,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onSaveEntry,
}: {
  days: string[];
  tasks: Task[];
  routines: Routine[];
  items: WeeklyBoardItem[];
  entries: WeeklyBoardEntry[];
  onToggleTask: (taskId: string) => Promise<void>;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => Promise<void>;
  onSaveEntry: (itemId: string, date: string, content: string) => Promise<void>;
}) {
  const groupedSections = (["monthSyncedTodo", "overallRoutine", "workTodo", "sideBusinessPlan"] as WeeklyBoardSection[]).map((section) => ({
    section,
    items: items.filter((item) => item.section === section),
  }));

  return (
    <section className="mt-3 space-y-3">
      <div className="weekly-summary-panel">
        <h3 className="text-base font-semibold text-[var(--ink)]">本周总览</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--soft-ink)]">
          上半部分会同步月历里已经写了日期的任务。下半部分是只属于周历的栏目，你可以把这一周的想法、安排和重点写在这里。
        </p>
      </div>

      <div className="weekly-table-shell">
        <table className="weekly-table">
          <thead>
            <tr>
              <th className="weekly-header-cell weekly-header-section">区域</th>
              <th className="weekly-header-cell weekly-header-item">栏目</th>
              {days.map((date) => (
                <th key={date} className="weekly-header-cell weekly-header-day">
                  <span>{date.slice(5)}</span>
                  <strong>{formatWeekdayOnly(date)}</strong>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedSections.map(({ section, items: sectionItems }) => (
              <WeeklySectionRows
                key={section}
                section={section}
                sectionLabel={weekSectionLabels[section]}
                items={sectionItems}
                days={days}
                tasks={tasks}
                routines={routines}
                entries={entries}
                onToggleTask={onToggleTask}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
                onSaveEntry={onSaveEntry}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WeeklySectionRows({
  section,
  sectionLabel,
  items,
  days,
  tasks,
  routines,
  entries,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onSaveEntry,
}: {
  section: WeeklyBoardSection;
  sectionLabel: string;
  items: WeeklyBoardItem[];
  days: string[];
  tasks: Task[];
  routines: Routine[];
  entries: WeeklyBoardEntry[];
  onToggleTask: (taskId: string) => Promise<void>;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => Promise<void>;
  onSaveEntry: (itemId: string, date: string, content: string) => Promise<void>;
}) {
  return (
    <>
      {items.map((item, itemIndex) => (
        <tr key={item.id} className="weekly-table-row">
          {itemIndex === 0 ? (
            <th className="weekly-section-cell" rowSpan={items.length} scope="rowgroup">
              {sectionLabel}
            </th>
          ) : null}
          <th className="weekly-item-cell" scope="row" style={{ backgroundColor: item.color }}>
            {item.label}
          </th>
          {days.map((date) => {
            if (section === "monthSyncedTodo") {
              const syncedTasks = sortDayTasks(
                tasks.filter((task) => task.scheduledDate === date && syncCategoryMatches(task, item.id)),
              );

              return (
                <td key={`${item.id}-${date}`} className="weekly-sync-td">
                  {syncedTasks.length === 0 ? null : (
                    <div className="weekly-pill-stack">
                      {syncedTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          routineColor={getRoutineColor(task, routines)}
                          onToggle={() => onToggleTask(task.id)}
                          onEdit={() => onEditTask(task)}
                          onDelete={task.source === "routine" ? undefined : () => onDeleteTask(task.id)}
                        />
                      ))}
                    </div>
                  )}
                </td>
              );
            }

            const entry = entries.find((current) => current.itemId === item.id && current.date === date);

            return (
              <td key={`${item.id}-${date}`} className="weekly-entry-td">
                <textarea
                  className="weekly-entry-input"
                  defaultValue={entry?.content ?? ""}
                  onBlur={(event) => void onSaveEntry(item.id, date, event.target.value)}
                  placeholder=""
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function RoutinePanel({
  routines,
  setRoutines,
  onSave,
}: {
  routines: Routine[];
  setRoutines: React.Dispatch<React.SetStateAction<Routine[]>>;
  onSave: () => Promise<void>;
}) {
  const sortedRoutines = [...routines].sort((left, right) => routineOrder.indexOf(left.frequency) - routineOrder.indexOf(right.frequency));

  return (
    <section className="mt-4 space-y-4">
      <div className="rounded-[24px] bg-[var(--panel)] p-4">
        <h3 className="text-lg font-semibold text-[var(--ink)]">固定事项编辑页</h3>
        <p className="mt-2 text-sm leading-7 text-[var(--soft-ink)]">
          这里维护你的每周 / 每月 routine。改这里一次，月历和周历都会同步更新，并且用特别颜色强调。
        </p>
      </div>

      <div className="space-y-3">
        {sortedRoutines.map((routine) => (
          <div key={routine.id} className="rounded-[24px] border border-[var(--line)] bg-white p-4">
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_140px]">
              <input
                className="inline-editor-input"
                value={routine.title}
                onChange={(event) =>
                  setRoutines((current) =>
                    current.map((item) => (item.id === routine.id ? { ...item, title: event.target.value } : item)),
                  )
                }
              />
              <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)]">
                {routine.frequency === "weekly"
                  ? `每周 ${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][routine.weeklyWeekday ?? 0]}`
                  : "每月月末"}
              </div>
              <input
                className="inline-editor-input"
                placeholder="时间备注，可留空"
                value={routine.scheduledTimeText ?? ""}
                onChange={(event) =>
                  setRoutines((current) =>
                    current.map((item) =>
                      item.id === routine.id ? { ...item, scheduledTimeText: event.target.value || null } : item,
                    ),
                  )
                }
              />
              <label className="flex items-center gap-2 rounded-[16px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink)]">
                <span>颜色</span>
                <input
                  className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                  type="color"
                  value={routine.highlightColor}
                  onChange={(event) =>
                    setRoutines((current) =>
                      current.map((item) =>
                        item.id === routine.id ? { ...item, highlightColor: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button className="soft-button soft-button-primary" onClick={() => void onSave()} type="button">
          保存 routine
        </button>
      </div>
    </section>
  );
}

function TodayPanel({
  tasks,
  todayIso,
  selectedDate,
  onSelectDate,
  onToggle,
}: {
  tasks: Task[];
  todayIso: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onToggle: (taskId: string) => Promise<void>;
}) {
  const todayTasks = sortDayTasks(tasks.filter((task) => task.scheduledDate && isSameDay(task.scheduledDate, todayIso)));
  const overdueTasks = sortDayTasks(
    tasks.filter((task) => task.source !== "routine" && task.scheduledDate && task.scheduledDate < todayIso && task.status === "open"),
  );

  return (
    <section className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <div className="rounded-[24px] bg-[var(--panel)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--ink)]">今天</h3>
          <button className="soft-button" onClick={() => onSelectDate(todayIso)} type="button">
            同步到当天详情
          </button>
        </div>
        <div className="space-y-3">
          {todayTasks.length === 0 ? (
            <EmptyState text="今天还没有排上事项。" />
          ) : (
            todayTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task.id)} />)
          )}
        </div>
      </div>
      <div className="rounded-[24px] bg-[var(--panel)] p-4">
        <h3 className="mb-3 text-lg font-semibold text-[var(--ink)]">逾期未完成</h3>
        <div className="space-y-3">
          {overdueTasks.length === 0 ? (
            <EmptyState text="当前没有逾期事项。" />
          ) : (
            overdueTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task.id)} />)
          )}
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">当前选中日期：{selectedDate}</p>
      </div>
    </section>
  );
}

function TaskCard({
  task,
  routineColor,
  onToggle,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  routineColor?: string | null;
  onToggle: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      className={[
        "task-card",
        "task-card-compact",
        task.status === "completed" ? "completed" : "",
        task.source === "routine" ? "routine-card" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      draggable={Boolean(onDragStart)}
      onDragStart={(event) => {
        event.stopPropagation();
        onDragStart?.();
      }}
      onDragEnd={(event) => {
        event.stopPropagation();
        onDragEnd?.();
      }}
      onClick={(event) => event.stopPropagation()}
      style={routineColor ? { borderColor: routineColor, backgroundColor: `${routineColor}22` } : undefined}
    >
      {onDelete ? (
        <button
          className="calendar-delete-button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          type="button"
        >
          ×
        </button>
      ) : null}
      <div className="task-card-main">
        <label className="task-check">
          <input checked={task.status === "completed"} disabled={task.source === "routine"} onChange={onToggle} type="checkbox" />
        </label>
        <div className="task-copy">
          <button className="task-title-button" disabled={task.source === "routine"} onClick={onEdit} type="button">
            {formatCalendarTaskTitle(task)}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  routineColor,
}: {
  task: Task;
  onToggle: () => void;
  routineColor?: string | null;
}) {
  return (
    <div
      className={task.status === "completed" ? "task-row completed" : "task-row"}
      style={routineColor ? { borderColor: routineColor, backgroundColor: `${routineColor}14` } : undefined}
    >
      <label className="flex flex-1 items-start gap-3">
        <input
          checked={task.status === "completed"}
          className="mt-1 h-4 w-4 rounded border-[var(--line)]"
          disabled={task.source === "routine"}
          onChange={onToggle}
          type="checkbox"
        />
        <div className="space-y-1">
          <p className="text-sm font-medium">{task.title}</p>
          <p className="text-xs text-[var(--soft-ink)]">
            {task.source === "routine" ? "固定事项" : task.scheduledTimeText ?? "未写时间"}
            {task.source !== "routine" ? ` · ${getCategoryLabel(task.category)}` : ""}
          </p>
        </div>
      </label>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold text-[var(--ink)]">{value}</span>
        <span className="h-2.5 w-10 rounded-full" style={{ backgroundColor: accent }} />
      </div>
    </div>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "rounded-[16px] border border-dashed border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]"
          : "rounded-[20px] border border-dashed border-[var(--line)] px-4 py-5 text-sm text-[var(--muted)]"
      }
    >
      {text}
    </div>
  );
}

function getRoutineColor(task: Task, routines: Routine[]) {
  if (task.source !== "routine") return null;
  const routineId = task.id.replace(/^routine-task-/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return routines.find((routine) => routine.id === routineId)?.highlightColor ?? null;
}

function buildWorkWeekDays(anchorDate: string) {
  const day = new Date(`${anchorDate}T00:00:00`).getDay();
  const offsetMap: Record<number, number> = {
    0: 5,
    1: 6,
    2: 0,
    3: 1,
    4: 2,
    5: 3,
    6: 4,
  };
  const start = addDays(anchorDate, -offsetMap[day]);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function syncCategoryMatches(task: Task, itemId: string) {
  if (itemId === "life-sync") return task.category === "life";
  if (itemId === "work-sync") return task.category === "work";
  if (itemId === "side-sync") return task.category === "sideBusiness";
  return false;
}

function updateWeeklyBoardEntriesState(entries: WeeklyBoardEntry[], itemId: string, date: string, content: string) {
  const nextEntries = entries.filter((entry) => !(entry.itemId === itemId && entry.date === date));
  if (!content) {
    return nextEntries;
  }
  return [...nextEntries, { itemId, date, content }];
}
