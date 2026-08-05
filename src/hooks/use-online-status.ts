import { useEffect, useState } from "react";

/** Tracks browser connectivity so field workflows can clearly show local offline operation. */
export function useOnlineStatus() {
  // SSR has no navigator; default to online until the hydrated browser can report actual connectivity.
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);

    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  return online;
}