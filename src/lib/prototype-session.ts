import { useEffect, useState } from "react";
import { z } from "zod";
import { authenticationRequiredEvent } from "./authentication-events";
import { appRoleSchema, hasPermission, type AppRole, type Permission } from "./authorization";

const sessionStorageKey = "aa360.prototype-session";
const authenticatedSessionStorageKey = "aa360.authenticated-session";
export const prototypeSessionChangedEvent = "aa360:prototype-session-changed";

export const prototypeSessionSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  roles: z.array(appRoleSchema).min(1),
});

const authenticatedSessionSchema = prototypeSessionSchema.extend({
  accessToken: z.string().min(1),
});

export type PrototypeSession = z.infer<typeof prototypeSessionSchema>;
export type AuthenticatedSession = z.infer<typeof authenticatedSessionSchema>;
export type AppSession = PrototypeSession | AuthenticatedSession;

export function startPrototypeCoachSession(email: string): PrototypeSession {
  const normalizedEmail = z.string().trim().email().max(254).parse(email);
  const session = prototypeSessionSchema.parse({
    displayName: displayNameForEmail(normalizedEmail),
    email: normalizedEmail,
    roles: ["coach"],
  });

  if (typeof window !== "undefined") {
    window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent(prototypeSessionChangedEvent));
  }
  return session;
}

export function startAuthenticatedSession({
  accessToken,
  email,
  roles,
}: {
  accessToken: string;
  email: string;
  roles: readonly AppRole[];
}): AuthenticatedSession {
  const normalizedEmail = z.string().trim().email().max(254).parse(email);
  const session = authenticatedSessionSchema.parse({
    accessToken,
    displayName: displayNameForEmail(normalizedEmail),
    email: normalizedEmail,
    roles,
  });

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(authenticatedSessionStorageKey, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent(prototypeSessionChangedEvent));
  }
  return session;
}

export function clearPrototypeSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(sessionStorageKey);
  window.sessionStorage.removeItem(authenticatedSessionStorageKey);
  window.dispatchEvent(new CustomEvent(prototypeSessionChangedEvent));
}

export function getPrototypeSession(): AppSession | null {
  if (typeof window === "undefined") return null;

  const authenticated = parseAuthenticatedSession(
    window.sessionStorage.getItem(authenticatedSessionStorageKey),
  );
  return authenticated ?? parsePrototypeSession(window.localStorage.getItem(sessionStorageKey));
}

export function parsePrototypeSession(serialized: string | null): PrototypeSession | null {
  try {
    return prototypeSessionSchema.parse(JSON.parse(serialized ?? "null"));
  } catch {
    return null;
  }
}

export function getServerAccessToken() {
  if (typeof window === "undefined") return null;
  return parseAuthenticatedSession(window.sessionStorage.getItem(authenticatedSessionStorageKey))
    ?.accessToken ?? null;
}

export function hasSessionPermission(
  session: AppSession | null | undefined,
  permission: Permission,
) {
  return Boolean(session && hasPermission(session.roles, permission));
}

export function usePrototypeSession() {
  const [session, setSession] = useState<AppSession | null | undefined>(undefined);

  useEffect(() => {
    const refresh = () => setSession(getPrototypeSession());
    const clearExpiredSession = () => clearPrototypeSession();
    refresh();
    window.addEventListener(prototypeSessionChangedEvent, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener(authenticationRequiredEvent, clearExpiredSession);
    return () => {
      window.removeEventListener(prototypeSessionChangedEvent, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(authenticationRequiredEvent, clearExpiredSession);
    };
  }, []);

  return session;
}

function parseAuthenticatedSession(serialized: string | null): AuthenticatedSession | null {
  try {
    return authenticatedSessionSchema.parse(JSON.parse(serialized ?? "null"));
  } catch {
    return null;
  }
}

function displayNameForEmail(email: string) {
  const localPart = email.split("@", 1)[0] ?? "Coach";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}