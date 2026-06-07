import { NextResponse } from "next/server";
import { getLifeOsSummary } from "@/lib/life-os-service";

export async function GET() {
  const summary = await getLifeOsSummary();
  return NextResponse.json(summary);
}
