import type { NotificationProvider } from "./provider";

const emailProvider: NotificationProvider = {
  async send({ to, subject, body, template }) {
    console.log(`[EMAIL] To: ${to}, Subject: ${subject}, Template: ${template}`);
    if (process.env.NODE_ENV === "test" && to.includes("fail")) {
      return { success: false, error: "Email delivery failed" };
    }
    return { success: true, messageId: `email_${Date.now()}_${Math.random().toString(36).slice(2)}` };
  },
};

export default emailProvider;
