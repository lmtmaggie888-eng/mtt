import crypto from "node:crypto";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import type { WechatInboundTextMessage } from "@/lib/wechat-types";

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  cdataPropName: "__cdata",
});

export function verifyWechatSignature({
  token,
  timestamp,
  nonce,
  signature,
}: {
  token: string;
  timestamp: string;
  nonce: string;
  signature: string;
}) {
  const sorted = [token, timestamp, nonce].sort().join("");
  const hash = crypto.createHash("sha1").update(sorted).digest("hex");
  return hash === signature;
}

export function parseWechatTextMessage(xmlText: string): WechatInboundTextMessage | null {
  const parsed = parser.parse(xmlText) as {
    xml?: {
      ToUserName?: string;
      FromUserName?: string;
      CreateTime?: number;
      MsgType?: string;
      Content?: string;
      MsgId?: string;
    };
  };

  const xml = parsed.xml;
  if (!xml || xml.MsgType !== "text" || !xml.Content || !xml.FromUserName || !xml.ToUserName) {
    return null;
  }

  return {
    toUserName: xml.ToUserName,
    fromUserName: xml.FromUserName,
    createTime: Number(xml.CreateTime ?? Date.now()),
    msgType: "text",
    content: xml.Content,
    msgId: String(xml.MsgId ?? ""),
  };
}

export function buildWechatTextReply({
  fromUserName,
  toUserName,
  content,
}: {
  fromUserName: string;
  toUserName: string;
  content: string;
}) {
  return builder.build({
    xml: {
      ToUserName: {
        __cdata: toUserName,
      },
      FromUserName: {
        __cdata: fromUserName,
      },
      CreateTime: Math.floor(Date.now() / 1000),
      MsgType: {
        __cdata: "text",
      },
      Content: {
        __cdata: content,
      },
    },
  });
}
