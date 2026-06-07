"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  buildMonthRows,
  expandRoutinesToTasks,
  formatCalendarTaskTitle,
  formatDateLabel,
  formatMonthLabel,
  formatWeekdayOnly,
  getCategoryLabel,
  getTodayIso,
  isSameDay,
  listMonthAnchors,
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
import type { LifeOsSummary, LifeOsTask, LifeOsTransaction } from "@/lib/life-os-types";

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
  const [activeMainPanel, setActiveMainPanel] = useState<"calendar" | "ledger">("calendar");
  const [view, setView] = useState<ViewMode>("month");
  const [anchorDate, setAnchorDate] = useState(getTodayIso());
  const [selectedDate, setSelectedDate] = useState(getTodayIso());
  const [quickInput, setQuickInput] = useState("todo 周五前整理小红书选题");
  const [message, setMessage] = useState("这里会统一收下微信和网页发来的记账、待办、日程。");
  const [isLoading, setIsLoading] = useState(true);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<EditingDraft | null>(null);
  const [draftingDate, setDraftingDate] = useState<string | null>(null);
  const [calendarDraftText, setCalendarDraftText] = useState("");
  const [lifeOsTasks, setLifeOsTasks] = useState<LifeOsTask[]>([]);
  const [transactions, setTransactions] = useState<LifeOsTransaction[]>([]);
  const [lifeOsSummary, setLifeOsSummary] = useState<LifeOsSummary | null>(null);

  useEffect(() => {
    void refreshAll();
  }, []);

  const monthAnchors = listMonthAnchors(anchorDate, 1);
  const routineTasks = useMemo(() => expandRoutinesToTasks(routines, monthAnchors), [routines, monthAnchors]);
  const lifeOsCalendarTasks = useMemo(() => lifeOsTasks.map(mapLifeOsTaskToCalendarTask), [lifeOsTasks]);
  const allTasks = useMemo(() => [...routineTasks, ...tasks, ...lifeOsCalendarTasks], [routineTasks, tasks, lifeOsCalendarTasks]);
  const workWeekDays = useMemo(() => buildWorkWeekDays(anchorDate), [anchorDate]);
  const todayIso = getTodayIso();

  const poolSourceTasks = useMemo(() => [...tasks, ...lifeOsCalendarTasks], [tasks, lifeOsCalendarTasks]);
  const groupedPool = useMemo(
    () =>
      categoryOrder.map((category) => ({
        category,
        tasks: poolSourceTasks.filter((task) => !task.scheduledDate && task.category === category),
      })),
    [poolSourceTasks],
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
    const [taskResponse, routineResponse, weeklyBoardResponse, lifeTaskResponse, transactionResponse, summaryResponse] = await Promise.all([
      fetch("/api/tasks", { cache: "no-store" }),
      fetch("/api/routines", { cache: "no-store" }),
      fetch("/api/weekly-board", { cache: "no-store" }),
      fetch("/api/life-os/tasks", { cache: "no-store" }),
      fetch("/api/life-os/transactions", { cache: "no-store" }),
      fetch("/api/life-os/summary", { cache: "no-store" }),
    ]);

    const taskPayload = (await taskResponse.json()) as { tasks: Task[] };
    const routinePayload = (await routineResponse.json()) as { routines: Routine[] };
    const weeklyPayload = (await weeklyBoardResponse.json()) as {
      items: WeeklyBoardItem[];
      entries: WeeklyBoardEntry[];
    };
    const lifeTaskPayload = lifeTaskResponse.ok ? ((await lifeTaskResponse.json()) as LifeOsTask[]) : [];
    const transactionPayload = transactionResponse.ok ? ((await transactionResponse.json()) as LifeOsTransaction[]) : [];
    const summaryPayload = summaryResponse.ok ? ((await summaryResponse.json()) as LifeOsSummary) : null;

    setTasks(taskPayload.tasks);
    setRoutines(routinePayload.routines);
    setRoutineDrafts(routinePayload.routines);
    setWeeklyBoardItems(weeklyPayload.items);
    setWeeklyBoardEntries(weeklyPayload.entries);
    setLifeOsTasks(lifeTaskPayload);
    setTransactions(transactionPayload);
    setLifeOsSummary(summaryPayload);
    setIsLoading(false);
  }

  async function toggleTask(taskId: string) {
    if (taskId.startsWith("routine-task-")) return;
    if (taskId.startsWith("lifeos-task-")) {
      const task = lifeOsCalendarTasks.find((item) => item.id === taskId);
      await fetch(`/api/life-os/tasks/${taskId.replace("lifeos-task-", "")}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: task?.status === "completed" ? "open" : "done" }),
      });
      await refreshAll();
      return;
    }
    await fetch(`/api/tasks/${taskId}/complete`, { method: "POST" });
    await refreshAll();
  }

  async function quickAddTask() {
    const text = quickInput.trim();
    if (!text) return;

    const response = await fetch("/api/life-os/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const payload = (await response.json()) as { reply?: string };
    await refreshAll();
    setMessage(payload.reply ?? "已收下这条记录");
    setQuickInput("");
  }

  async function addTaskOnDate(date: string) {
    const text = calendarDraftText.trim();
    if (!text) {
      setDraftingDate(null);
      return;
    }

    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        openId: "web-preview-user",
        anchorDate: date,
        scheduledDate: date,
      }),
    });
    await refreshAll();
    setSelectedDate(date);
    setDraftingDate(null);
    setCalendarDraftText("");
    setMessage(`已添加到 ${date}`);
  }

  async function assignTaskToDate(taskId: string, targetDate: string) {
    if (taskId.startsWith("routine-task-")) return;
    if (isLifeOsTaskId(taskId)) {
      setMessage("这类待办暂时不支持拖拽改期，可以直接再发一句带日期的日程。");
      return;
    }
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
    if (isLifeOsTaskId(taskId)) {
      setMessage("这类待办暂时不支持拖回待办池。");
      return;
    }
    await fetch(`/api/tasks/${taskId}/unschedule`, { method: "POST" });
    await refreshAll();
    setMessage("任务已移回待办池");
  }

  async function removeTask(taskId: string) {
    if (taskId.startsWith("routine-task-")) return;
    if (isLifeOsTaskId(taskId)) {
      await fetch(`/api/life-os/tasks/${taskId.replace("lifeos-task-", "")}`, { method: "DELETE" });
      await refreshAll();
      setMessage("这条任务已删除");
      return;
    }
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    await refreshAll();
    setMessage("任务已删除");
  }

  function beginEdit(task: Task) {
    if (task.source === "routine") return;
    if (isLifeOsTaskId(task.id)) {
      setMessage("这类任务现在支持勾选和删除，标题编辑我已经留到下一步接口扩展。");
      return;
    }
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
        <section className="rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_14px_40px_rgba(171,135,104,0.10)] backdrop-blur">
          <div className="grid gap-4 xl:grid-cols-[0.8fr_1.25fr_0.9fr] xl:items-center">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">微信生活台</p>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">月历待办 · 记账系统</h1>
              <p className="text-xs leading-5 text-[var(--soft-ink)]">
                微信和网页写入的待办、日程、记账都汇总到这里，先切系统，再录一句话。
              </p>
            </div>
            <div className="main-panel-switch" aria-label="主系统切换">
              <button
                className={activeMainPanel === "calendar" ? "main-panel-tab active" : "main-panel-tab"}
                onClick={() => setActiveMainPanel("calendar")}
                type="button"
              >
                <span>日历 / 月历</span>
                <small>安排待办、周历复盘、routine</small>
              </button>
              <button
                className={activeMainPanel === "ledger" ? "main-panel-tab active" : "main-panel-tab"}
                onClick={() => setActiveMainPanel("ledger")}
                type="button"
              >
                <span>记账系统</span>
                <small>消费流水、本月摘要、自然语言记账</small>
              </button>
            </div>
            <div className="rounded-[20px] border border-white/70 bg-white/70 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <SummaryCard label="今日花费" value={lifeOsSummary?.today_spend ?? 0} accent="var(--rose)" prefix="¥" />
                <SummaryCard label="本月花费" value={lifeOsSummary?.month_spend ?? 0} accent="var(--sand)" prefix="¥" />
                <SummaryCard label="开放待办" value={(lifeOsSummary?.open_todos ?? 0) + (lifeOsSummary?.upcoming_schedules ?? 0)} accent="var(--mist)" />
              </div>
            </div>
          </div>
          <div className="grid gap-2 rounded-[20px] bg-[var(--panel)] p-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">自然语言入口</p>
              <div className="mt-2 rounded-[18px] border border-[var(--line)] bg-white p-3 shadow-sm">
                <textarea
                  className="min-h-20 w-full resize-none border-0 bg-transparent text-sm leading-6 text-[var(--ink)] outline-none"
                  value={quickInput}
                  onChange={(event) => setQuickInput(event.target.value)}
                  placeholder="例如：午饭36 / todo 周五前整理选题 / 明天10点提醒我发报价"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="soft-button soft-button-primary" onClick={quickAddTask} type="button">
                立即写入
              </button>
              <span className="text-xs leading-5 text-[var(--soft-ink)]">{isLoading ? "正在同步任务..." : message}</span>
            </div>
          </div>
        </section>

        {activeMainPanel === "calendar" ? (
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
                draftingDate={draftingDate}
                calendarDraftText={calendarDraftText}
                onStartDraft={(date) => {
                  setSelectedDate(date);
                  setDraftingDate(date);
                  setCalendarDraftText("");
                }}
                onDraftTextChange={setCalendarDraftText}
                onSaveDraft={addTaskOnDate}
                onCancelDraft={() => {
                  setDraftingDate(null);
                  setCalendarDraftText("");
                }}
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
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">记账摘要</p>
                <span className="text-xs text-[var(--soft-ink)]">最近 {transactions.length} 笔</span>
              </div>
              <div className="mt-4 space-y-2">
                {transactions.slice(0, 5).length === 0 ? (
                  <EmptyState text="还没有记账，可以输入：午饭36，奶茶18。" compact />
                ) : (
                  transactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="finance-row">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink)]">{transaction.note || transaction.category}</p>
                        <p className="text-xs text-[var(--soft-ink)]">{transaction.occurred_at} · {transaction.category}</p>
                      </div>
                      <span className={transaction.direction === "income" ? "finance-amount income" : "finance-amount"}>
                        {transaction.direction === "income" ? "+" : "-"}¥{transaction.amount.toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

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
                            draggable={!isLifeOsTaskId(task.id)}
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
                                {!isLifeOsTaskId(task.id) ? (
                                  <button className="soft-button compact-button" onClick={() => beginEdit(task)} type="button">
                                    编辑
                                  </button>
                                ) : null}
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
        ) : (
          <LedgerPanel summary={lifeOsSummary} transactions={transactions} />
        )}

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
  draftingDate,
  calendarDraftText,
  onStartDraft,
  onDraftTextChange,
  onSaveDraft,
  onCancelDraft,
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
  draftingDate: string | null;
  calendarDraftText: string;
  onStartDraft: (date: string) => void;
  onDraftTextChange: (text: string) => void;
  onSaveDraft: (date: string) => Promise<void>;
  onCancelDraft: () => void;
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
                    const isDrafting = draftingDate === date;
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
                        onClick={() => {
                          onSelectDate(date);
                          onStartDraft(date);
                        }}
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
                        {isDrafting ? (
                          <div className="calendar-inline-draft" onClick={(event) => event.stopPropagation()}>
                            <input
                              autoFocus
                              className="calendar-inline-input"
                              value={calendarDraftText}
                              onChange={(event) => onDraftTextChange(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void onSaveDraft(date);
                                }
                                if (event.key === "Escape") {
                                  onCancelDraft();
                                }
                              }}
                              placeholder="写入这一天..."
                            />
                            <button className="calendar-inline-save" onClick={() => void onSaveDraft(date)} type="button">
                              加
                            </button>
                          </div>
                        ) : null}
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

function LedgerPanel({
  summary,
  transactions,
}: {
  summary: LifeOsSummary | null;
  transactions: LifeOsTransaction[];
}) {
  const expenseTransactions = transactions.filter((item) => item.direction === "expense");
  const incomeTransactions = transactions.filter((item) => item.direction === "income");
  const recentExpense = expenseTransactions.slice(0, 30).reduce((total, item) => total + item.amount, 0);
  const recentIncome = incomeTransactions.slice(0, 30).reduce((total, item) => total + item.amount, 0);

  return (
    <section className="ledger-shell">
      <div className="ledger-hero">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">记账系统</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">消费、收入和报销先放这里</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--soft-ink)]">
            在上方自然语言入口输入“午饭36”“打车42可报销”“昨天收到稿费800”，这里会自动汇总。
          </p>
        </div>
        <div className="ledger-kpi-grid">
          <SummaryCard label="今日花费" value={summary?.today_spend ?? 0} accent="var(--rose)" prefix="¥" />
          <SummaryCard label="本月花费" value={summary?.month_spend ?? 0} accent="var(--sand)" prefix="¥" />
          <SummaryCard label="近30笔支出" value={recentExpense} accent="var(--mist)" prefix="¥" />
          <SummaryCard label="近30笔收入" value={recentIncome} accent="#dcebd6" prefix="¥" />
        </div>
      </div>

      <div className="ledger-table-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">流水明细</p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--ink)]">最近 {transactions.length} 笔记录</h3>
          </div>
        </div>

        {transactions.length === 0 ? (
          <EmptyState text="还没有记账，可以先输入：午饭36，奶茶18。" />
        ) : (
          <div className="ledger-table">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="ledger-table-row">
                <span>{transaction.occurred_at}</span>
                <strong>{transaction.note || transaction.category}</strong>
                <span>{transaction.category}{transaction.reimbursable ? " · 可报销" : ""}</span>
                <b className={transaction.direction === "income" ? "finance-amount income" : "finance-amount"}>
                  {transaction.direction === "income" ? "+" : "-"}¥{transaction.amount.toFixed(2)}
                </b>
              </div>
            ))}
          </div>
        )}
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

function SummaryCard({ label, value, accent, prefix = "" }: { label: string; value: number; accent: string; prefix?: string }) {
  return (
    <div className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold text-[var(--ink)]">{prefix}{prefix ? value.toFixed(0) : value}</span>
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

function mapLifeOsTaskToCalendarTask(task: LifeOsTask): Task {
  const dueDate = task.due_at ? task.due_at.slice(0, 10) : null;
  const dueTime = task.due_at ? task.due_at.slice(11, 16) : null;

  return {
    id: `lifeos-task-${task.id}`,
    rawInput: task.raw_message,
    title: task.title,
    category: task.kind === "schedule" ? "work" : detectLifeOsCategory(task.title),
    status: task.status === "done" || task.status === "completed" ? "completed" : "open",
    scheduledDate: dueDate,
    scheduledTimeText: dueTime,
    collaboratorName: null,
    source: "wechat_message",
    completedAt: task.status === "done" || task.status === "completed" ? task.created_at : null,
  };
}

function detectLifeOsCategory(title: string): TaskCategory {
  if (/[买购淘宝京东拼多多]/.test(title)) return "buy";
  if (/[副业合作报价选题拍摄小红书账号图文]/.test(title)) return "sideBusiness";
  if (/[饭健身医生生活朋友约]/.test(title)) return "life";
  if (/[灵感想法]/.test(title)) return "idea";
  return "work";
}

function isLifeOsTaskId(taskId: string) {
  return taskId.startsWith("lifeos-task-");
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
