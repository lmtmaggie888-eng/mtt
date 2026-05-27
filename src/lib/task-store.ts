import { promises as fs } from "node:fs";
import path from "node:path";
import { initialRoutines, initialTasks, initialWeeklyBoardEntries, initialWeeklyBoardItems } from "@/lib/mock-data";
import type {
  ParsedTaskDraft,
  Routine,
  Task,
  TaskCategory,
  WeeklyBoardEntry,
  WeeklyBoardItem,
} from "@/lib/workbench-types";

type StoredData = {
  users: Array<{
    openId: string;
    displayName: string | null;
    timezone: string;
    morningReminderTime: string;
    isActive: boolean;
  }>;
  tasks: Task[];
  routines: Routine[];
  weeklyBoardItems: WeeklyBoardItem[];
  weeklyBoardEntries: WeeklyBoardEntry[];
};

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "tasks.json");

function buildDefaultStore(): StoredData {
  return {
    users: [
      {
        openId: "web-preview-user",
        displayName: "网页预览用户",
        timezone: "Asia/Shanghai",
        morningReminderTime: "08:30",
        isActive: true,
      },
    ],
    tasks: initialTasks,
    routines: initialRoutines,
    weeklyBoardItems: initialWeeklyBoardItems,
    weeklyBoardEntries: initialWeeklyBoardEntries,
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(buildDefaultStore(), null, 2), "utf-8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf-8");
  const parsed = JSON.parse(raw) as Partial<StoredData>;
  const fallback = buildDefaultStore();

  return {
    users: parsed.users ?? fallback.users,
    tasks: parsed.tasks ?? fallback.tasks,
    routines: parsed.routines ?? fallback.routines,
    weeklyBoardItems: parsed.weeklyBoardItems ?? fallback.weeklyBoardItems,
    weeklyBoardEntries: parsed.weeklyBoardEntries ?? fallback.weeklyBoardEntries,
  } satisfies StoredData;
}

async function writeStore(data: StoredData) {
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2), "utf-8");
}

export async function upsertWechatUser(openId: string) {
  const store = await readStore();
  let user = store.users.find((item) => item.openId === openId);

  if (!user) {
    user = {
      openId,
      displayName: null,
      timezone: "Asia/Shanghai",
      morningReminderTime: "08:30",
      isActive: true,
    };
    store.users.push(user);
    await writeStore(store);
  }

  return user;
}

export async function createTaskFromParsedMessage({
  openId,
  rawInput,
  parsed,
}: {
  openId: string;
  rawInput: string;
  parsed: ParsedTaskDraft;
}) {
  const store = await readStore();
  await upsertWechatUser(openId);

  const task: Task = {
    id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    rawInput,
    title: parsed.title,
    category: parsed.category,
    status: "open",
    scheduledDate: parsed.scheduledDate,
    scheduledTimeText: parsed.scheduledTimeText,
    collaboratorName: parsed.collaboratorName,
    source: "wechat_message",
    completedAt: null,
  };

  store.tasks.unshift(task);
  await writeStore(store);
  return task;
}

export async function listTasks() {
  const store = await readStore();
  return store.tasks;
}

export async function listRoutines() {
  const store = await readStore();
  return store.routines;
}

export async function listWeeklyBoard() {
  const store = await readStore();
  return {
    items: store.weeklyBoardItems,
    entries: store.weeklyBoardEntries,
  };
}

export async function toggleTaskCompletion(taskId: string) {
  const store = await readStore();
  const task = store.tasks.find((item) => item.id === taskId);

  if (!task) {
    return null;
  }

  task.status = task.status === "completed" ? "open" : "completed";
  task.completedAt = task.status === "completed" ? new Date().toISOString() : null;

  await writeStore(store);
  return task;
}

export async function scheduleTask(taskId: string, scheduledDate: string) {
  const store = await readStore();
  const task = store.tasks.find((item) => item.id === taskId);

  if (!task) {
    return null;
  }

  task.scheduledDate = scheduledDate;
  await writeStore(store);
  return task;
}

export async function unscheduleTask(taskId: string) {
  const store = await readStore();
  const task = store.tasks.find((item) => item.id === taskId);

  if (!task) {
    return null;
  }

  task.scheduledDate = null;
  await writeStore(store);
  return task;
}

export async function updateTask(
  taskId: string,
  updates: {
    title: string;
    category: TaskCategory;
    scheduledTimeText: string;
  },
) {
  const store = await readStore();
  const task = store.tasks.find((item) => item.id === taskId);

  if (!task) {
    return null;
  }

  task.title = updates.title;
  task.category = updates.category;
  task.scheduledTimeText = updates.scheduledTimeText.trim() ? updates.scheduledTimeText.trim() : null;
  await writeStore(store);
  return task;
}

export async function updateRoutines(routines: Routine[]) {
  const store = await readStore();
  store.routines = routines;
  await writeStore(store);
  return store.routines;
}

export async function updateWeeklyBoardEntries(entries: WeeklyBoardEntry[]) {
  const store = await readStore();
  store.weeklyBoardEntries = entries;
  await writeStore(store);
  return store.weeklyBoardEntries;
}

export async function deleteTask(taskId: string) {
  const store = await readStore();
  const nextTasks = store.tasks.filter((item) => item.id !== taskId);

  if (nextTasks.length === store.tasks.length) {
    return false;
  }

  store.tasks = nextTasks;
  await writeStore(store);
  return true;
}
