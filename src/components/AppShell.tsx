import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, ArrowLeft, BarChart3, ClipboardList, LayoutDashboard, Settings, Wifi, WifiOff } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { usePrototypeSession } from "@/lib/prototype-session";

type Props = {
  title: string;
  subtitle?: string;
  backTo?: string;
  wide?: boolean;
  children: ReactNode;
};

const navigation = [
  { icon: LayoutDashboard, label: "Home", mobileLabel: "Home", to: "/dashboard" },
  { icon: BarChart3, label: "Performance", mobileLabel: "Stats", to: "/athlete-performance" },
  { icon: Activity, label: "Assess", mobileLabel: "Assess", to: "/battery" },
  { icon: ClipboardList, label: "History", mobileLabel: "History", to: "/history" },
  { icon: Settings, label: "Settings", mobileLabel: "More", to: "/settings" },
] as const;

export function AppShell({ title, subtitle, backTo, wide = false, children }: Props) {
  const navigate = useNavigate();
  const session = usePrototypeSession();
  const online = useOnlineStatus();

  useEffect(() => {
    if (session === null) navigate({ to: "/login", replace: true });
  }, [navigate, session]);

  if (session === undefined || session === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5 text-center">
        <p className="text-sm text-muted-foreground">
          {session === undefined ? "Checking local session..." : "Redirecting to local sign in..."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="relative overflow-hidden border-b border-background/10 bg-foreground px-5 pb-7 pt-6 text-background shadow-elevated">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-primary" />
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div
          className={`relative mx-auto grid items-center gap-3 ${wide ? "max-w-6xl" : "max-w-2xl"} ${
            backTo ? "grid-cols-[auto_auto_minmax(0,1fr)]" : "grid-cols-[auto_minmax(0,1fr)]"
          }`}
        >
          {backTo ? (
            <Link
              to={backTo}
              aria-label="Go back"
              className="grid size-10 shrink-0 place-items-center rounded-md border border-background/25 transition-colors hover:bg-background/10"
            >
              <ArrowLeft className="size-5" />
            </Link>
          ) : null}
          <img
            src="/images/ai-athlete-logo.png"
            alt="AI Athlete Assessment logo"
            className="size-10 shrink-0 rounded-md object-cover"
          />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            {subtitle ? (
              <p className="truncate text-xs font-medium text-background/60">{subtitle}</p>
            ) : null}
            <span
              className={`mt-2 inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                online
                  ? "border-background/20 bg-background/10 text-background/75"
                  : "border-primary/60 bg-primary text-primary-foreground"
              }`}
            >
              {online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
              {online ? "Online" : "Offline - local mode"}
            </span>
          </div>
          <nav className="col-span-full mt-3 hidden items-center gap-1 border-t border-background/10 pt-3 lg:flex">
            {navigation.map(({ icon: Icon, label, to }) => (
              <Link
                key={to}
                to={to}
                activeProps={{ className: "bg-background/12 text-background" }}
                className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-background/55 transition-colors hover:bg-background/8 hover:text-background"
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className={`relative mx-auto -mt-3 w-full px-4 pb-28 sm:px-5 lg:pb-16 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>
        {children}
      </main>
      <nav className="fixed inset-x-4 bottom-4 z-30 grid grid-cols-5 rounded-2xl border border-background/70 bg-foreground/95 p-1.5 text-background shadow-elevated backdrop-blur-xl lg:hidden">
        {navigation.map(({ icon: Icon, label, mobileLabel, to }) => (
          <Link
            key={to}
            to={to}
            activeProps={{ className: "bg-primary text-primary-foreground" }}
            aria-label={label}
            className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-bold text-background/55 transition-colors"
          >
            <Icon className="size-4" />
            <span className="max-w-full truncate">{mobileLabel}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
