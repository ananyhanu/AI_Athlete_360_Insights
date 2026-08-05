export const authenticationRequiredEvent = "aa360:authentication-required";

export function notifyAuthenticationRequired() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(authenticationRequiredEvent));
}