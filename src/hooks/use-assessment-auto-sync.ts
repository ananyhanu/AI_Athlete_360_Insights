import { useEffect } from "react";
import { syncConfiguredAthletes } from "@/lib/athlete-sync-runtime";
import { shouldAttemptAutomaticSync, syncConfiguredAssessments } from "@/lib/assessment-sync-runtime";

export function useAssessmentAutoSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const syncWhenAvailable = () => {
      if (!shouldAttemptAutomaticSync(navigator.onLine)) return;
      void (async () => {
        await syncConfiguredAthletes();
        await syncConfiguredAssessments();
      })().catch((error: unknown) => console.error(error));
    };

    syncWhenAvailable();
    window.addEventListener("online", syncWhenAvailable);
    return () => window.removeEventListener("online", syncWhenAvailable);
  }, [enabled]);
}