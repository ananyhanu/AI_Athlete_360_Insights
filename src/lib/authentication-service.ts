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

export async function registerCoach({
  baseUrl,
  email,
  fetchFn,
  mobileNumber,
  password,
}: {
  baseUrl: string;
  email: string;
  fetchFn?: typeof fetch;
  mobileNumber: string;
  password: string;
}) {
  const client = new ApiClient(fetchFn ? { baseUrl, fetchFn } : { baseUrl });
  return client.request<{ message: string }>("/v1/auth/signup", {
    body: { email, mobileNumber, password },
    method: "POST",
  });
}

export async function requestMobileOtp({
  baseUrl,
  email,
  fetchFn,
  mobileNumber,
}: {
  baseUrl: string;
  email: string;
  fetchFn?: typeof fetch;
  mobileNumber: string;
}) {
  const client = new ApiClient(fetchFn ? { baseUrl, fetchFn } : { baseUrl });
  return client.request<{ developmentOtp?: string; message: string }>("/v1/auth/mobile-otp", {
    body: { email, mobileNumber },
    method: "POST",
  });
}

export async function verifyMobileOtp({
  baseUrl,
  email,
  fetchFn,
  otp,
}: {
  baseUrl: string;
  email: string;
  fetchFn?: typeof fetch;
  otp: string;
}) {
  const client = new ApiClient(fetchFn ? { baseUrl, fetchFn } : { baseUrl });
  const payload = await client.request<unknown>("/v1/auth/mobile-otp/verify", {
    body: { email, otp },
    method: "POST",
  });
  return tokenResponseSchema.parse(payload);
}

export async function getAuthenticatedUser({
  accessToken,
  baseUrl,
  fetchFn,
}: {
  accessToken: string;
  baseUrl: string;
  fetchFn?: typeof fetch;
}) {
  const client = new ApiClient(fetchFn ? { baseUrl, fetchFn } : { baseUrl });
  const payload = await client.request<unknown>("/v1/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    method: "GET",
  });
  return tokenResponseSchema.shape.user.parse(payload);
}