export type LifeOsIntent = "bookkeeping" | "todo" | "schedule" | "query" | "needs_clarification";

export type LifeOsTransactionDirection = "income" | "expense";

export type LifeOsTransaction = {
  id: number;
  occurred_at: string;
  direction: LifeOsTransactionDirection;
  amount: number;
  category: string;
  note: string;
  reimbursable: boolean;
  raw_message: string;
  created_at: string;
};

export type LifeOsTaskKind = "todo" | "schedule";
export type LifeOsTaskStatus = "open" | "done" | "completed";

export type LifeOsTask = {
  id: number;
  kind: LifeOsTaskKind;
  title: string;
  due_at: string | null;
  status: LifeOsTaskStatus;
  raw_message: string;
  created_at: string;
};

export type LifeOsMessageResponse = {
  intent: LifeOsIntent;
  reply: string;
  transactions: LifeOsTransaction[];
  tasks: LifeOsTask[];
};

export type LifeOsSummary = {
  today_spend: number;
  month_spend: number;
  open_todos: number;
  upcoming_schedules: number;
};
