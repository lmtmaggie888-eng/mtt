import type { LifeOsIntent, LifeOsTaskKind, LifeOsTransactionDirection } from "@/lib/life-os-types";

type ParsedTransactionDraft = {
  occurred_at: string;
  direction: LifeOsTransactionDirection;
  amount: number;
  category: string;
  note: string;
  reimbursable: boolean;
};

type ParsedTaskDraft = {
  kind: LifeOsTaskKind;
  title: string;
  due_at: string | null;
};

const amountRe = /([\u4e00-\u9fa5A-Za-z]+)?(\d+(?:\.\d{1,2})?)/;
const timePointRe = /(\d{1,2})\s*点(?:(\d{1,2})\s*分?)?/;
const nextWeekdayRe = /下周([一二三四五六日天])/;
const thisWeekdayRe = /周([一二三四五六日天])(?:前)?/;

const weekdayMap: Record<string, number> = {
  一: 0,
  二: 1,
  三: 2,
  四: 3,
  五: 4,
  六: 5,
  日: 6,
  天: 6,
};

const expenseCategoryRules: Record<string, string[]> = {
  餐饮: ["饭", "午饭", "晚饭", "早餐", "奶茶", "咖啡", "吃", "餐"],
  交通: ["打车", "地铁", "公交", "高铁", "火车", "机票", "交通"],
  购物: ["买", "购物", "淘宝", "京东", "拼多多"],
  办公: ["打印纸", "报销", "办公", "文具"],
  住房: ["房租", "水电", "物业", "宽带", "燃气"],
  医疗: ["药", "医院", "挂号", "体检"],
};

const incomeKeywords = ["收入", "收到", "工资", "稿费", "奖金", "报销到账"];
const reimburseKeywords = ["报销", "可报销", "公司报"];
const todoKeywords = ["todo", "待办", "记一下"];
const scheduleKeywords = ["提醒", "明天", "后天", "下周", "今天", "今晚", "上午", "下午"];
const queryKeywords = ["多少", "花了", "任务", "待办", "日程", "本月", "今天"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateLocal(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatLocalIsoMinutes(date: Date) {
  return `${formatDateLocal(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toMondayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function inferCategory(message: string, fallbackNote: string) {
  const haystack = `${fallbackNote} ${message}`;
  for (const [category, keywords] of Object.entries(expenseCategoryRules)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return category;
    }
  }
  return "其他";
}

function detectOccurredAt(message: string) {
  const now = new Date();
  if (message.includes("昨天")) {
    const date = new Date(now);
    date.setDate(now.getDate() - 1);
    return formatDateLocal(date);
  }
  if (message.includes("前天")) {
    const date = new Date(now);
    date.setDate(now.getDate() - 2);
    return formatDateLocal(date);
  }
  if (message.includes("明天")) {
    const date = new Date(now);
    date.setDate(now.getDate() + 1);
    return formatDateLocal(date);
  }
  return formatDateLocal(now);
}

function cleanTransactionNote(part: string, amountText: string) {
  const amountStart = part.indexOf(amountText);
  const safeStart = amountStart >= 0 ? amountStart : 0;
  const amountEnd = safeStart + amountText.length;
  const prefix = part.slice(0, safeStart).trim().replace(/^[：:]+|[：:]+$/g, "");
  if (prefix) {
    return prefix;
  }
  const suffix = part.slice(amountEnd).trim().replace(/^[：:]+|[：:]+$/g, "");
  return suffix || part;
}

function resolveNextWeekday(now: Date, targetWeekday: number, forceNextWeek: boolean) {
  const currentWeekday = toMondayIndex(now);
  let delta = (targetWeekday - currentWeekday + 7) % 7;

  if (forceNextWeek) {
    delta = delta === 0 ? 7 : delta + 7;
  } else if (delta === 0) {
    delta = 7;
  }

  const next = new Date(now);
  next.setDate(now.getDate() + delta);
  return next;
}

function extractDueAt(message: string) {
  const now = new Date();
  let targetDay = new Date(now);

  if (message.includes("明天")) {
    targetDay.setDate(now.getDate() + 1);
  } else if (message.includes("后天")) {
    targetDay.setDate(now.getDate() + 2);
  } else {
    const nextWeekMatch = message.match(nextWeekdayRe);
    if (nextWeekMatch?.[1]) {
      targetDay = resolveNextWeekday(now, weekdayMap[nextWeekMatch[1]], true);
    } else {
      const thisWeekMatch = message.match(thisWeekdayRe);
      if (thisWeekMatch?.[1]) {
        targetDay = resolveNextWeekday(now, weekdayMap[thisWeekMatch[1]], false);
      }
    }
  }

  const timeMatch = message.match(timePointRe);
  let hour = 9;
  let minute = 0;

  if (timeMatch?.[1]) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2] ?? 0);
    if (message.includes("下午") && hour < 12) {
      hour += 12;
    }
  }

  if (message.includes("前") && !timeMatch) {
    hour = 18;
  }

  if (scheduleKeywords.some((keyword) => message.includes(keyword)) || timeMatch || message.match(thisWeekdayRe)) {
    targetDay.setHours(hour, minute, 0, 0);
    return formatLocalIsoMinutes(targetDay);
  }

  return null;
}

function cleanTaskTitle(message: string, kind: LifeOsTaskKind) {
  let title = message.trim();

  for (const keyword of [...todoKeywords, "提醒我", "提醒", "记一下：", "记一下"]) {
    title = title.replaceAll(keyword, "");
  }

  title = title.replace(timePointRe, "");
  title = title.replace(nextWeekdayRe, "");
  title = title.replace(thisWeekdayRe, "");

  for (const keyword of ["明天", "后天", "今天", "今晚", "上午", "下午", "中午", "晚上", "前"]) {
    title = title.replaceAll(keyword, "");
  }

  title = title.replace(/\s+/g, " ").trim().replace(/^[：:]+|[：:]+$/g, "");

  if (kind === "schedule") {
    title = title.replace(/^给/, "").trim();
  }

  return title || message;
}

export function detectLifeOsIntent(message: string): LifeOsIntent {
  const lowered = message.toLowerCase().trim();
  if (lowered.startsWith("query ")) {
    return "query";
  }
  if (queryKeywords.some((keyword) => lowered.includes(keyword))) {
    return "query";
  }
  if (todoKeywords.some((keyword) => lowered.includes(keyword))) {
    return "todo";
  }
  if (scheduleKeywords.some((keyword) => lowered.includes(keyword))) {
    return "schedule";
  }
  return "bookkeeping";
}

export function parseLifeOsTransactions(message: string): ParsedTransactionDraft[] {
  const parts = message
    .split(/[，,、；;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const occurredAt = detectOccurredAt(message);
  const direction: LifeOsTransactionDirection = incomeKeywords.some((keyword) => message.includes(keyword))
    ? "income"
    : "expense";
  const reimbursable = reimburseKeywords.some((keyword) => message.includes(keyword));
  const results: ParsedTransactionDraft[] = [];

  for (const part of parts) {
    const match = part.match(amountRe);
    if (!match?.[2]) {
      continue;
    }

    const amount = Number(match[2]);
    const note = cleanTransactionNote(part, match[2]);
    results.push({
      occurred_at: occurredAt,
      direction,
      amount,
      category: inferCategory(part, note),
      note,
      reimbursable,
    });
  }

  return results;
}

export function parseLifeOsTask(message: string, kind: LifeOsTaskKind): ParsedTaskDraft {
  return {
    kind,
    title: cleanTaskTitle(message, kind),
    due_at: extractDueAt(message),
  };
}
