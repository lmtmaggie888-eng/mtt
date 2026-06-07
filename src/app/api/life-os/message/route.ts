import { NextResponse } from "next/server";
import { z } from "zod";
import { postLifeOsMessage } from "@/lib/life-os-service";

export async function POST(request: Request) {
  const schema = z.object({
    message: z.string().min(1),
  });
  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const payload = await postLifeOsMessage(parsed.data.message);
  return NextResponse.json(payload);
}
