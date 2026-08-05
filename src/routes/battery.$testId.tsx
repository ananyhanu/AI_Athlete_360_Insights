import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/battery/$testId")({
  component: () => <Outlet />,
});
