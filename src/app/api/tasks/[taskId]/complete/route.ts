import { NextResponse } from "next/server";
import { toggleTaskCompletion } from "@/lib/task-store";

export async function POST(_: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const task = await toggleTaskCompletion(taskId);

  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  return NextResponse.json({ task });
}
