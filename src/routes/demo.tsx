import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Camera,
  ClipboardList,
  FileText,
  Gauge,
  History,
  Settings,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Demo Screens — AI Athlete 360" },
      {
        name: "description",
        content: "Quick navigation to every AI Athlete 360 screen for demo walkthroughs.",
      },
      { property: "og:title", content: "Demo Screens — AI Athlete 360" },
      { property: "og:description", content: "Open any screen directly during a demo." },
    ],
  }),
  component: DemoScreens,
});

const screens = [
  { label: "Dashboard", to: "/dashboard", icon: Gauge },
  { label: "Register Athlete", to: "/register-athlete", icon: UserPlus },
  { label: "Select Athlete", to: "/select-athlete", icon: Users },
  { label: "Battery Fitness Tests", to: "/battery", icon: Activity },
  { label: "Camera", to: "/camera", icon: Camera },
  { label: "AI Processing", to: "/processing", icon: Sparkles },
  { label: "Result", to: "/result", icon: Trophy },
  { label: "PDF Report", to: "/report", icon: FileText },
  { label: "History", to: "/history", icon: History },
  { label: "Settings", to: "/settings", icon: Settings },
] as const;

function DemoScreens() {
  return (
    <AppShell title="Demo Screens" subtitle="Direct navigation" backTo="/dashboard">
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center gap-3">
          <ClipboardList className="size-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            Demo-only shortcuts. The normal user flow is unaffected.
          </p>
        </div>
      </section>

      <div className="mt-4 space-y-3">
        {screens.map(({ label, to, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex h-16 items-center gap-4 rounded-2xl bg-card px-5 text-base font-semibold text-foreground shadow-card transition-transform active:scale-[0.98]"
          >
            <span className="bg-gradient-primary grid size-11 shrink-0 place-items-center rounded-2xl text-primary-foreground">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 truncate">{label}</span>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
