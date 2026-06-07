import {
  detectLifeOsIntent,
  parseLifeOsTask,
  parseLifeOsTransactions,
} from "@/lib/life-os-parser";
import { readLifeOsStore, writeLifeOsStore } from "@/lib/life-os-store";
import type {
  LifeOsMessageResponse,
  LifeOsSummary,
  LifeOsTask,
  LifeOsTaskKind,
  LifeOsTaskStatus,
  LifeOsTransaction,
} from "@/lib/life-os-types";

const remoteBaseUrl = process.env.LIFE_OS_API_BASE?.trim();

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateLocal(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatLocalIsoSeconds(date: Date) {
  return `${formatDateLocal(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeTaskStatus(status: string): LifeOsTaskStatus {
  if (status === "done" || status === "completed") {
    return "done";
  }
  return "open";
}

async function fetchRemoteJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!remoteBaseUrl) {
    throw new Error("remote Life OS is not configured");
  }

  const response = await fetch(`${remoteBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : (null as T);

  if (!response.ok) {
    throw new Error(`remote Life OS request failed: ${response.status}`);
  }

  return data;
}

async function withRemoteFallback<T>(path: string, init: RequestInit | undefined, local: () => Promise<T>) {
  if (!remoteBaseUrl) {
    return local();
  }

  try {
    return await fetchRemoteJson<T>(path, init);
  } catch (error) {
    console.warn(`[life-os] remote request failed, falling back to local store for ${path}`, error);
    return local();
  }
}

function sortTransactions(transactions: LifeOsTransaction[]) {
  return [...transactions].sort((left, right) => {
    const dateCompare = right.occurred_at.localeCompare(left.occurred_at);
    return dateCompare !== 0 ? dateCompare : right.id - left.id;
  });
}

function sortTasks(tasks: LifeOsTask[]) {
  return [...tasks].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "open" ? -1 : 1;
    }
    const leftAnchor = left.due_at ?? left.created_at;
    const rightAnchor = right.due_at ?? right.created_at;
    return leftAnchor.localeCompare(rightAnchor) || right.id - left.id;
  });
}

async function handleBookkeeping(message: string): Promise<LifeOsMessageResponse> {
  const parsed = parseLifeOsTransactions(message);
  if (parsed.length === 0) {
    return {
      intent: "needs_clarification",
      reply: "我没解析出金额，换一种更短更明确的说法试试。",
      transactions: [],
      tasks: [],
    };
  }

  const store = await readLifeOsStore();
  const createdAt = formatLocalIsoSeconds(new Date());
  const created = parsed.map((item) => {
    const record: LifeOsTransaction = {
      id: store.nextTransactionId++,
      occurred_at: item.occurred_at,
      direction: item.direction,
      amount: item.amount,
      category: item.category,
      note: item.note,
      reimbursable: item.reimbursable,
      raw_message: message,
      created_at: createdAt,
    };
    store.transactions.push(record);
    return record;
  });

  await writeLifeOsStore(store);
  const total = created.reduce((sum, item) => sum + item.amount, 0);

  return {
    intent: "bookkeeping",
    reply: `已记 ${created.length} 笔，合计 ${total.toFixed(2)} 元。`,
    transactions: created,
    tasks: [],
  };
}

async function handleTask(message: string, kind: LifeOsTaskKind): Promise<LifeOsMessageResponse> {
  const parsed = parseLifeOsTask(message, kind);
  const store = await readLifeOsStore();
  const task: LifeOsTask = {
    id: store.nextTaskId++,
    kind: parsed.kind,
    title: parsed.title,
    due_at: parsed.due_at,
    status: "open",
    raw_message: message,
    created_at: formatLocalIsoSeconds(new Date()),
  };

  store.tasks.push(task);
  await writeLifeOsStore(store);

  return {
    intent: kind,
    reply: `已加入${kind === "todo" ? "待办" : "日程"}：${task.title}`,
    transactions: [],
    tasks: [task],
  };
}

async function handleQuery(message: string): Promise<LifeOsMessageResponse> {
  const summary = await getLifeOsSummaryLocal();
  const tasks = await listLifeOsTasksLocal();
  const monthPrefix = formatDateLocal(new Date()).slice(0, 7);
  const transactions = await listLifeOsTransactionsLocal();

  if (message.includes("今天") && message.includes("花")) {
    return {
      intent: "query",
      reply: `今天支出 ${summary.today_spend.toFixed(2)} 元。`,
      transactions: [],
      tasks: [],
    };
  }

  if (message.includes("本月") && message.includes("餐饮")) {
    const total = transactions
      .filter((item) => item.direction === "expense" && item.category === "餐饮" && item.occurred_at.startsWith(monthPrefix))
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      intent: "query",
      reply: `本月餐饮支出 ${total.toFixed(2)} 元。`,
      transactions: [],
      tasks: [],
    };
  }

  if (message.includes("今天") && (message.includes("任务") || message.includes("待办"))) {
    const openTitles = tasks
      .filter((item) => item.status === "open")
      .slice(0, 5)
      .map((item) => item.title);

    return {
      intent: "query",
      reply: openTitles.length === 0 ? "今天没有待办。" : `当前待办：${openTitles.join("；")}`,
      transactions: [],
      tasks: [],
    };
  }

  return {
    intent: "needs_clarification",
    reply: "我能查今天支出、本月餐饮和当前待办，换一种问法试试。",
    transactions: [],
    tasks: [],
  };
}

async function postLifeOsMessageLocal(message: string) {
  const intent = detectLifeOsIntent(message);
  if (intent === "bookkeeping") {
    return handleBookkeeping(message);
  }
  if (intent === "todo") {
    return handleTask(message, "todo");
  }
  if (intent === "schedule") {
    return handleTask(message, "schedule");
  }
  return handleQuery(message);
}

async function listLifeOsTransactionsLocal() {
  const store = await readLifeOsStore();
  return sortTransactions(store.transactions).slice(0, 100);
}

async function listLifeOsTasksLocal() {
  const store = await readLifeOsStore();
  return sortTasks(store.tasks).slice(0, 100);
}

async function updateLifeOsTaskStatusLocal(taskId: number, status: string) {
  const store = await readLifeOsStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) {
    return { ok: false };
  }

  task.status = normalizeTaskStatus(status);
  await writeLifeOsStore(store);
  return { ok: true };
}

async function deleteLifeOsTaskLocal(taskId: number) {
  const store = await readLifeOsStore();
  const nextTasks = store.tasks.filter((item) => item.id !== taskId);
  if (nextTasks.length === store.tasks.length) {
    return { ok: false };
  }
  store.tasks = nextTasks;
  await writeLifeOsStore(store);
  return { ok: true };
}

async function getLifeOsSummaryLocal(): Promise<LifeOsSummary> {
  const tasks = await listLifeOsTasksLocal();
  const transactions = await listLifeOsTransactionsLocal();
  const today = formatDateLocal(new Date());
  const monthPrefix = today.slice(0, 7);

  const todaySpend = transactions
    .filter((item) => item.direction === "expense" && item.occurred_at === today)
    .reduce((sum, item) => sum + item.amount, 0);
  const monthSpend = transactions
    .filter((item) => item.direction === "expense" && item.occurred_at.startsWith(monthPrefix))
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    today_spend: todaySpend,
    month_spend: monthSpend,
    open_todos: tasks.filter((item) => item.kind === "todo" && item.status === "open").length,
    upcoming_schedules: tasks.filter((item) => item.kind === "schedule" && item.status === "open").length,
  };
}

export async function postLifeOsMessage(message: string) {
  return withRemoteFallback("/api/message", {
    method: "POST",
    body: JSON.stringify({ message }),
  }, () => postLifeOsMessageLocal(message));
}

export async function listLifeOsTransactions() {
  return withRemoteFallback("/api/transactions", undefined, listLifeOsTransactionsLocal);
}

export async function listLifeOsTasks() {
  return withRemoteFallback("/api/tasks", undefined, listLifeOsTasksLocal);
}

export async function updateLifeOsTaskStatus(taskId: number, status: string) {
  return withRemoteFallback(
    `/api/tasks/${taskId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
    () => updateLifeOsTaskStatusLocal(taskId, status),
  );
}

export async function deleteLifeOsTask(taskId: number) {
  return withRemoteFallback(
    `/api/tasks/${taskId}`,
    {
      method: "DELETE",
    },
    () => deleteLifeOsTaskLocal(taskId),
  );
}

export async function getLifeOsSummary() {
  return withRemoteFallback("/api/summary", undefined, getLifeOsSummaryLocal);
}
