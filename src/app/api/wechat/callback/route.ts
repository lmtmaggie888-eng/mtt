import { NextResponse } from "next/server";
import { createTaskFromParsedMessage } from "@/lib/task-store";
import { getCategoryLabel, getTodayIso, parseQuickInput } from "@/lib/workbench-utils";
import { buildWechatTextReply, parseWechatTextMessage, verifyWechatSignature } from "@/lib/wechat-utils";

function getWechatToken() {
  return process.env.WECHAT_TOKEN ?? "replace-me";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const signature = searchParams.get("signature");
  const timestamp = searchParams.get("timestamp");
  const nonce = searchParams.get("nonce");
  const echostr = searchParams.get("echostr");

  if (!signature || !timestamp || !nonce || !echostr) {
    return NextResponse.json({ error: "missing wechat verification params" }, { status: 400 });
  }

  const isValid = verifyWechatSignature({
    token: getWechatToken(),
    timestamp,
    nonce,
    signature,
  });

  if (!isValid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  return new Response(echostr, { status: 200 });
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const signature = searchParams.get("signature");
  const timestamp = searchParams.get("timestamp");
  const nonce = searchParams.get("nonce");

  if (!signature || !timestamp || !nonce) {
    return NextResponse.json({ error: "missing signature params" }, { status: 400 });
  }

  const isValid = verifyWechatSignature({
    token: getWechatToken(),
    timestamp,
    nonce,
    signature,
  });

  if (!isValid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const rawXml = await request.text();
  const message = parseWechatTextMessage(rawXml);

  if (!message) {
    return new Response("success", { status: 200 });
  }

  const parsed = parseQuickInput(message.content, getTodayIso());
  await createTaskFromParsedMessage({
    openId: message.fromUserName,
    rawInput: message.content,
    parsed,
  });

  const categoryLabel = getCategoryLabel(parsed.category);
  const replyText = parsed.scheduledDate
    ? `已记录到：${categoryLabel}\n已安排到：${parsed.scheduledDate}${parsed.scheduledTimeText ? ` ${parsed.scheduledTimeText}` : ""}`
    : `已记录到：${categoryLabel}\n暂时还没安排日期，已放入待办池`;

  const xmlReply = buildWechatTextReply({
    fromUserName: message.toUserName,
    toUserName: message.fromUserName,
    content: replyText,
  });

  return new Response(xmlReply, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
