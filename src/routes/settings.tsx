import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Globe, LogOut, Moon, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { clearPrototypeSession, usePrototypeSession } from "@/lib/prototype-session";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AI Athlete 360" },
      {
        name: "description",
        content: "Coach preferences: language, notifications, offline mode and account options.",
      },
      { property: "og:title", content: "Settings — AI Athlete 360" },
      { property: "og:description", content: "Manage app preferences and account options." },
    ],
  }),
  component: SettingsScreen,
});

function SettingsScreen() {
  const navigate = useNavigate();
  const session = usePrototypeSession();
  const [language, setLanguage] = useState("en");
  const [notifications, setNotifications] = useState(true);
  const [offline, setOffline] = useState(false);

  return (
    <AppShell title="Settings" subtitle={session?.displayName ?? "Local coach"} backTo="/dashboard">
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <label className="block">
          <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Globe className="size-4 text-primary" />
            Language
          </span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground"
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी (Hindi)</option>
          </select>
        </label>
      </section>

      <section className="mt-3 space-y-3 rounded-2xl bg-card p-5 shadow-card">
        <Toggle
          icon={Bell}
          label="Assessment Notifications"
          checked={notifications}
          onChange={setNotifications}
        />
        <Toggle icon={Moon} label="Offline Analysis Mode" checked={offline} onChange={setOffline} />
      </section>

      <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center gap-3 text-sm">
          <ShieldCheck className="size-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">App Version</span>
          <span className="ml-auto font-semibold">1.4.0 (demo)</span>
        </div>
      </section>

      <button
        onClick={() => {
          clearPrototypeSession();
          navigate({ to: "/login" });
        }}
        className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-card text-base font-semibold text-destructive shadow-card transition-transform active:scale-[0.98]"
      >
        <LogOut className="size-5" />
        Log Out
      </button>
    </AppShell>
  );
}

function Toggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof Bell;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <Icon className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-[var(--primary)]"
      />
    </label>
  );
}
