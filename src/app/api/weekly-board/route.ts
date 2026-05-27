import { NextResponse } from "next/server";
import { z } from "zod";
import { listWeeklyBoard, updateWeeklyBoardEntries } from "@/lib/task-store";

const entrySchema = z.object({
  itemId: z.string().min(1),
  date: z.string().min(10),
  content: z.string(),
});

const payloadSchema = z.object({
  entries: z.array(entrySchema),
});

export async function GET() {
  const board = await listWeeklyBoard();
  return NextResponse.json(board);
}

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const entries = await updateWeeklyBoardEntries(parsed.data.entries);
  return NextResponse.json({ entries });
}
