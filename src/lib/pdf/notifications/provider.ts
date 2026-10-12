export interface NotificationProvider {
  send(params: {
    to: string;
    subject?: string;
    body: string;
    template: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

export type Channel = "email" | "sms" | "whatsapp" | "in_app";

export function getProvider(channel: Channel): NotificationProvider {
  switch (channel) {
    case "email": return require("./email").default;
    case "sms": return require("./sms").default;
    case "whatsapp": return require("./whatsapp").default;
    case "in_app":
      return {
        async send() { return { success: true, messageId: `in_app_${Date.now()}` }; },
      };
    default: throw new Error(`Unknown channel: ${channel}`);
  }
}
