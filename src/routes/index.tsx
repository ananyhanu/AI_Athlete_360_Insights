import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Athlete 360 — AI Powered Battery Fitness Assessment" },
      {
        name: "description",
        content:
          "AI Athlete 360 helps sports coaches run AI powered battery fitness assessments, track athlete tests and generate reports.",
      },
      { property: "og:title", content: "AI Athlete 360 — AI Powered Battery Fitness Assessment" },
      {
        property: "og:description",
        content: "AI Athlete 360 helps sports coaches run AI powered battery fitness assessments, track athlete tests and generate reports.",
      },
    ],
  }),
  component: Splash,
});

function Splash() {
  return (
    <div
      className="relative flex min-h-screen flex-col justify-end overflow-hidden bg-foreground bg-cover bg-center px-6 py-10 text-primary-foreground"
      style={{ backgroundImage: "url('/images/login-page-run-athlete.png')" }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/45 to-foreground/5" />
      <div className="relative mx-auto w-full max-w-md text-center">
        <img
          src="/images/ai-athlete-logo.png"
          alt="AI Athlete Assessment logo"
          className="mx-auto size-12 rounded-md object-cover shadow-elevated"
        />
        <h1 className="mt-4 text-3xl font-extrabold">AI Athlete 360</h1>
        <p className="mt-2 text-sm text-primary-foreground/80">
          AI-powered battery fitness assessment
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex h-14 w-full items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-foreground shadow-elevated transition-transform active:scale-[0.98]"
        >
          Get started
        </Link>
      </div>
    </div>
  );
}
