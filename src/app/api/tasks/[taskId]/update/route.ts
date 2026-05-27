import { NextResponse } from "next/server";
import { z } from "zod";
import { updateTask } from "@/lib/task-store";

const schema = z.object({
  title: z.string().min(1),
  category: z.enum(["work", "sideBusiness", "buy", "life", "idea"]),
  scheduledTimeText: z.string(),
});

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const task = await updateTask(taskId, parsed.data);
  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  return NextResponse.json({ task });
}
