import { NextResponse } from "next/server";
import { createTaskFromParsedMessage, listTasks } from "@/lib/task-store";
import { getTodayIso, parseQuickInput } from "@/lib/workbench-utils";

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    text?: string;
    openId?: string;
    anchorDate?: string;
    scheduledDate?: string;
  };

  if (!body.text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const anchorDate = body.anchorDate ?? getTodayIso();
  const parsed = parseQuickInput(body.text, anchorDate);
  if (body.scheduledDate) {
    parsed.scheduledDate = body.scheduledDate;
  }
  const task = await createTaskFromParsedMessage({
    openId: body.openId ?? "web-preview-user",
    rawInput: body.text,
    parsed,
  });

  return NextResponse.json({ task });
}
