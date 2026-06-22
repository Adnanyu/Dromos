import { config } from "./config.js";

export async function createUserProfile(input: { userId: string; email: string; username: string }): Promise<void> {
  const response = await fetch(`${config.userServiceUrl}/internal/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Name": "auth-service"
    },
    body: JSON.stringify({
      user_id: input.userId,
      email: input.email,
      username: input.username
    })
  });

  if (!response.ok && response.status !== 409) {
    const body = await response.text();
    throw new Error(`user service profile creation failed: ${response.status} ${body}`);
  }
}

