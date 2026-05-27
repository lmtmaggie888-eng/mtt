import { NextResponse } from "next/server";
import { z } from "zod";
import { listRoutines, updateRoutines } from "@/lib/task-store";

const routineSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(["work", "sideBusiness", "buy", "life", "idea"]),
  frequency: z.enum(["weekly", "monthly"]),
  weeklyWeekday: z.number().int().nullable(),
  monthlyRule: z.enum(["lastDay"]).nullable(),
  scheduledTimeText: z.string().nullable(),
  highlightColor: z.string().min(1),
  isActive: z.boolean(),
});

const payloadSchema = z.object({
  routines: z.array(routineSchema),
});

export async function GET() {
  const routines = await listRoutines();
  return NextResponse.json({ routines });
}

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const routines = await updateRoutines(parsed.data.routines);
  return NextResponse.json({ routines });
}
