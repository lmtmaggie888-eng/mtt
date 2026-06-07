import type { ParsedTaskDraft, Routine, Task, TaskCategory } from "@/lib/workbench-types";

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const workWeekOrder = [2, 3, 4, 5, 6, 0, 1];

export function getTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function toIsoDate(input: string | Date) {
  const date = typeof input === "string" ? new Date(`${input}T00:00:00`) : input;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfMonth(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(1);
  return toIsoDate(date);
}

export function endOfMonth(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setMonth(date.getMonth() + 1, 0);
  return toIsoDate(date);
}

export function startOfWeek(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return toIsoDate(date);
}

export function endOfWeek(isoDate: string) {
  return addDays(startOfWeek(isoDate), 6);
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function buildMonthGrid(isoDate: string) {
  const first = new Date(`${startOfMonth(isoDate)}T00:00:00`);
  const last = new Date(`${endOfMonth(isoDate)}T00:00:00`);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  const gridEnd = new Date(last);
  gridEnd.setDate(last.getDate() + (6 - last.getDay()));

  const days: string[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    days.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function buildMonthRows(isoDate: string) {
  const start = new Date(`${startOfMonth(isoDate)}T00:00:00`);
  const end = new Date(`${endOfMonth(isoDate)}T00:00:00`);
  const rows: Array<Array<string | null>> = [];

  let currentRow: Array<string | null> = new Array(7).fill(null);
  const cursor = new Date(start);

  while (cursor <= end) {
    const current = new Date(cursor);
    const columnIndex = workWeekOrder.indexOf(current.getDay());
    currentRow[columnIndex] = toIsoDate(current);

    if (columnIndex === 6) {
      rows.push(currentRow);
      currentRow = new Array(7).fill(null);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  if (currentRow.some(Boolean)) {
    rows.push(currentRow);
  }

  return rows;
}

export function listMonthAnchors(anchorDate: string, count: number) {
  const anchors: string[] = [];
  const start = new Date(`${startOfMonth(anchorDate)}T00:00:00`);

  for (let index = 0; index < count; index += 1) {
    const current = new Date(start);
    current.setMonth(start.getMonth() + index, 1);
    anchors.push(toIsoDate(current));
  }

  return anchors;
}

export function isSameDay(left: string, right: string) {
  return left === right;
}

export function sortDayTasks(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    const leftCompleted = left.status === "completed" ? 1 : 0;
    const rightCompleted = right.status === "completed" ? 1 : 0;
    if (leftCompleted !== rightCompleted) {
      return leftCompleted - rightCompleted;
    }

    const leftTime = left.scheduledTimeText ?? "zzzz";
    const rightTime = right.scheduledTimeText ?? "zzzz";
    return leftTime.localeCompare(rightTime, "zh-CN");
  });
}

export function formatMonthLabel(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}

export function formatDateLabel(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdayLabels[date.getDay()]}`;
}

export function formatWeekdayOnly(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return weekdayLabels[date.getDay()];
}

export function formatRelativeDateText(isoDate: string, timeText: string | null) {
  return `${isoDate}${timeText ? ` ${timeText}` : ""}`;
}

export function getCategoryLabel(category: TaskCategory) {
  const labels: Record<TaskCategory, string> = {
    work: "工作",
    sideBusiness: "副业",
    buy: "买",
    life: "生活",
    idea: "灵感",
  };

  return labels[category];
}

export function formatCalendarTaskTitle(task: Task) {
  return task.scheduledTimeText ? `${task.scheduledTimeText} ${task.title}` : task.title;
}

export function parseQuickInput(input: string, anchorDate: string): ParsedTaskDraft {
  const trimmed = input.trim();
  const scheduledDate = detectDate(trimmed, anchorDate);
  const scheduledTimeText = detectTimeText(trimmed);
  const collaboratorName = detectCollaborator(trimmed);

  return {
    title: buildTitle(trimmed),
    category: detectCategory(trimmed),
    scheduledDate,
    scheduledTimeText,
    collaboratorName,
  };
}

export function expandRoutinesToTasks(routines: Routine[], monthAnchors: string[]) {
  const result: Task[] = [];

  for (const monthAnchor of monthAnchors) {
    const start = new Date(`${startOfMonth(monthAnchor)}T00:00:00`);
    const end = new Date(`${endOfMonth(monthAnchor)}T00:00:00`);

    for (const routine of routines) {
      if (!routine.isActive) continue;

      if (routine.frequency === "weekly" && routine.weeklyWeekday !== null) {
        const cursor = new Date(start);
        while (cursor <= end) {
          if (cursor.getDay() === routine.weeklyWeekday) {
            result.push(routineToTask(routine, toIsoDate(cursor)));
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }

      if (routine.frequency === "monthly" && routine.monthlyRule === "lastDay") {
        result.push(routineToTask(routine, toIsoDate(end)));
      }
    }
  }

  return result;
}

function routineToTask(routine: Routine, scheduledDate: string): Task {
  return {
    id: `routine-task-${routine.id}-${scheduledDate}`,
    rawInput: routine.title,
    title: routine.title,
    category: routine.category,
    status: "open",
    scheduledDate,
    scheduledTimeText: routine.scheduledTimeText,
    collaboratorName: null,
    source: "routine",
    completedAt: null,
  };
}

function detectDate(input: string, anchorDate: string) {
  const explicitYear = input.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (explicitYear) {
    return `${explicitYear[1]}-${explicitYear[2].padStart(2, "0")}-${explicitYear[3].padStart(2, "0")}`;
  }

  const monthDay = input.match(/(\d{1,2})月(\d{1,2})日?/);
  if (monthDay) {
    const anchorYear = anchorDate.slice(0, 4);
    return `${anchorYear}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`;
  }

  const dottedMonthDay = input.match(/(^|[^\d])(\d{1,2})[./-](\d{1,2})(?!\d)/);
  if (dottedMonthDay) {
    const anchorYear = anchorDate.slice(0, 4);
    return `${anchorYear}-${dottedMonthDay[2].padStart(2, "0")}-${dottedMonthDay[3].padStart(2, "0")}`;
  }

  if (input.includes("今天")) return anchorDate;
  if (input.includes("明天")) return addDays(anchorDate, 1);
  if (input.includes("后天")) return addDays(anchorDate, 2);

  const nextWeekMatch = input.match(/下周([一二三四五六日天])/);
  if (nextWeekMatch) {
    const target = chineseWeekdayToIndex(nextWeekMatch[1]);
    const thisWeekStart = new Date(`${startOfWeek(anchorDate)}T00:00:00`);
    thisWeekStart.setDate(thisWeekStart.getDate() + 7 + target);
    return toIsoDate(thisWeekStart);
  }

  return null;
}

function detectTimeText(input: string) {
  const exact = input.match(/(\d{1,2}:\d{2})/);
  if (exact) return exact[1];

  if (input.includes("上午")) return "上午";
  if (input.includes("中午")) return "中午";
  if (input.includes("下午")) return "下午";
  if (input.includes("晚上")) return "晚上";

  return null;
}

function detectCategory(input: string): TaskCategory {
  if (/(买|下单|补货|购物|防晒)/.test(input)) return "buy";
  if (/(看医生|健身|约饭|回家|家里|生活)/.test(input)) return "life";
  if (/(合作|报价|方案|交付|回复|跟进|momo|shenyu)/i.test(input)) return "sideBusiness";
  if (/(选题|灵感|想做|点子|合集)/.test(input)) return "idea";
  return "work";
}

function detectCollaborator(input: string) {
  const known = ["shenyu", "momo"];
  const matched = known.find((name) => input.toLowerCase().includes(name));
  return matched ?? null;
}

function buildTitle(input: string) {
  return input
    .replace(
      /今天|明天|后天|下周[一二三四五六日天]|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日?|(^|[^\d])\d{1,2}[./-]\d{1,2}(?!\d)/g,
      " ",
    )
    .replace(/上午|中午|下午|晚上|\d{1,2}:\d{2}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chineseWeekdayToIndex(char: string) {
  const mapping: Record<string, number> = {
    日: 0,
    天: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
  };

  return mapping[char];
}
