import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteLifeOsTask, updateLifeOsTaskStatus } from "@/lib/life-os-service";

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const schema = z.object({
    status: z.string().min(1),
  });
  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const result = await updateLifeOsTaskStatus(Number(taskId), parsed.data.status);
  if (!result.ok) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function DELETE(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  const result = await deleteLifeOsTask(Number(taskId));
  if (!result.ok) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
