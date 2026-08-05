import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, Upload } from "lucide-react";
import { useRef } from "react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/camera")({
  head: () => ({
    meta: [
      { title: "Capture Video — AI Athlete 360" },
      {
        name: "description",
        content: "Record or upload the athlete's test video for AI movement analysis.",
      },
      { property: "og:title", content: "Capture Video — AI Athlete 360" },
      { property: "og:description", content: "Record or upload a test video for analysis." },
    ],
  }),
  component: CameraScreen,
});

function CameraScreen() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleUpload() {
    // TODO: POST the selected video file to FastAPI backend
    navigate({ to: "/processing" });
  }

  return (
    <AppShell title="Camera" subtitle="Step 3 of 4" backTo="/select-test">
      <div className="grid aspect-[3/4] w-full place-items-center rounded-3xl border-2 border-dashed border-primary/30 bg-secondary text-center shadow-card">
        <div className="px-6">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
            <Camera className="size-8" />
          </span>
          <p className="mt-4 font-display text-lg font-bold">Camera Preview</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Position the athlete fully in frame, side view, good lighting.
          </p>
        </div>
      </div>

      <input ref={inputRef} type="file" accept="video/*" hidden onChange={handleUpload} />

      <button
        onClick={() => inputRef.current?.click()}
        className="bg-gradient-primary mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98]"
      >
        <Upload className="size-5" />
        Upload Video
      </button>
    </AppShell>
  );
}
