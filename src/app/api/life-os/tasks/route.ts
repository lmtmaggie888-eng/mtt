import { NextResponse } from "next/server";
import { listLifeOsTasks } from "@/lib/life-os-service";

export async function GET() {
  const tasks = await listLifeOsTasks();
  return NextResponse.json(tasks);
}
