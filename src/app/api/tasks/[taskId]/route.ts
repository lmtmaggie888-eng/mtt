import { NextResponse } from "next/server";
import { deleteTask } from "@/lib/task-store";

export async function DELETE(_: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const deleted = await deleteTask(taskId);

  if (!deleted) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
