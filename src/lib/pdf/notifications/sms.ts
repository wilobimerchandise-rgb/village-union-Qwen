import type { NotificationProvider } from "./provider";

const smsProvider: NotificationProvider = {
  async send({ to, body, template }) {
    console.log(`[SMS] To: ${to}, Template: ${template}`);
    if (process.env.NODE_ENV === "test" && to.includes("fail")) {
      return { success: false, error: "SMS delivery failed" };
    }
    return { success: true, messageId: `sms_${Date.now()}_${Math.random().toString(36).slice(2)}` };
  },
};

export default smsProvider;
