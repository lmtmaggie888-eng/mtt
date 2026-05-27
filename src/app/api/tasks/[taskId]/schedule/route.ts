import { NextResponse } from "next/server";
import { z } from "zod";
import { scheduleTask } from "@/lib/task-store";

const schema = z.object({
  scheduledDate: z.string().min(10),
});

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "scheduledDate is required" }, { status: 400 });
  }

  const task = await scheduleTask(taskId, parsed.data.scheduledDate);
  return NextResponse.json({ task });
}
