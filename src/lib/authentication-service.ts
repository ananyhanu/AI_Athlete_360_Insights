import { z } from "zod";
import { ApiClient } from "./api-client";
import { appRoleSchema } from "./authorization";

const tokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal("bearer"),
  user: z.object({
    email: z.string().email(),
    id: z.string().min(1),
    roles: z.array(appRoleSchema).min(1),
  }),
});

export async function authenticateWithPassword({
  baseUrl,
  email,
  fetchFn,
  password,
}: {
  baseUrl: string;
  email: string;
  fetchFn?: typeof fetch;
  password: string;
}) {
  const client = new ApiClient(fetchFn ? { baseUrl, fetchFn } : { baseUrl });
  const payload = await client.request<unknown>("/v1/auth/token", {
    body: { email, password },
    method: "POST",
  });
  return tokenResponseSchema.parse(payload);
}