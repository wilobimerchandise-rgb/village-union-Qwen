import type { NotificationProvider } from "./provider";

const whatsappProvider: NotificationProvider = {
  async send({ to, body, template }) {
    console.log(`[WHATSAPP] To: ${to}, Template: ${template}`);
    if (process.env.NODE_ENV === "test" && to.includes("fail")) {
      return { success: false, error: "WhatsApp delivery failed" };
    }
    return { success: true, messageId: `whatsapp_${Date.now()}_${Math.random().toString(36).slice(2)}` };
  },
};

export default whatsappProvider;
