export type TaskCategory = "work" | "sideBusiness" | "buy" | "life" | "idea";
export type TaskStatus = "open" | "completed";
export type TaskSource = "wechat_message" | "web_quick_capture" | "routine";
export type ViewMode = "month" | "week" | "today" | "routine";

export type Task = {
  id: string;
  rawInput: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  scheduledDate: string | null;
  scheduledTimeText: string | null;
  collaboratorName: string | null;
  source: TaskSource;
  completedAt: string | null;
};

export type ParsedTaskDraft = {
  title: string;
  category: TaskCategory;
  scheduledDate: string | null;
  scheduledTimeText: string | null;
  collaboratorName: string | null;
};

export type RoutineFrequency = "weekly" | "monthly";

export type Routine = {
  id: string;
  title: string;
  category: TaskCategory;
  frequency: RoutineFrequency;
  weeklyWeekday: number | null;
  monthlyRule: "lastDay" | null;
  scheduledTimeText: string | null;
  highlightColor: string;
  isActive: boolean;
};

export type WeeklyBoardSection =
  | "monthSyncedTodo"
  | "overallRoutine"
  | "workTodo"
  | "sideBusinessPlan";

export type WeeklyBoardItem = {
  id: string;
  section: WeeklyBoardSection;
  label: string;
  color: string;
};

export type WeeklyBoardEntry = {
  itemId: string;
  date: string;
  content: string;
};
