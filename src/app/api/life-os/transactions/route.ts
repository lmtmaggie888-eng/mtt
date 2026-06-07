import { NextResponse } from "next/server";
import { listLifeOsTransactions } from "@/lib/life-os-service";

export async function GET() {
  const transactions = await listLifeOsTransactions();
  return NextResponse.json(transactions);
}
