export type WechatInboundTextMessage = {
  toUserName: string;
  fromUserName: string;
  createTime: number;
  msgType: "text";
  content: string;
  msgId: string;
};
