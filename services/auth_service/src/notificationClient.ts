import { config } from "./config.js";

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!config.notificationServiceUrl) return;
  const response = await fetch(`${config.notificationServiceUrl}/internal/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Name": "auth-service"
    },
    body: JSON.stringify({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? {}
    })
  });
  if (!response.ok && response.status !== 202) {
    throw new Error(`notification creation failed: ${response.status}`);
  }
}

