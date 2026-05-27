import { NextResponse } from "next/server";
import { unscheduleTask } from "@/lib/task-store";

export async function POST(_: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const task = await unscheduleTask(taskId);

  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  return NextResponse.json({ task });
}
