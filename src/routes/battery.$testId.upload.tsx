import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { FolderOpen, Film, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { VideoPreview } from "@/components/VideoPreview";
import { useSelectedAthlete } from "@/lib/athletes";
import { getBatteryTest } from "@/lib/battery-tests";
import { LocalCaptureRepository } from "@/lib/local-capture-repository";

export const Route = createFileRoute("/battery/$testId/upload")({
  head: () => ({
    meta: [
      { title: "Select Video — AI Athlete 360" },
      {
        name: "description",
        content: "Pick a test video from recent clips, device storage or recent uploads.",
      },
      { property: "og:title", content: "Select Video — AI Athlete 360" },
      { property: "og:description", content: "Choose a recorded video before AI analysis." },
    ],
  }),
  component: UploadPicker,
});

function UploadPicker() {
  const { testId } = useParams({ from: "/battery/$testId/upload" });
  const test = getBatteryTest(testId);
  const navigate = useNavigate();
  const athlete = useSelectedAthlete();
  const input = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<{ durationSeconds: number; file: File } | null>(null);

  const back = () => navigate({ to: "/battery/$testId", params: { testId: test.id } });

  async function selectFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Select a video file for this assessment.");
      return;
    }

    setSelected({ durationSeconds: await videoDuration(file), file });
  }

  async function useVideo() {
    if (!selected) return;
    setSaving(true);

    try {
      const capture = await new LocalCaptureRepository().save({
        athleteId: athlete.id,
        blob: selected.file,
        durationSeconds: selected.durationSeconds,
        mimeType: selected.file.type,
        source: "upload",
        testId: test.id,
      });
      navigate({
        to: "/battery/$testId/processing",
        params: { testId: test.id },
        search: { captureId: capture.id, source: "upload" },
      });
    } catch (error) {
      console.error(error);
      toast.error("The selected video could not be saved securely on this device.");
    } finally {
      setSaving(false);
    }
  }

  if (selected) {
    return (
      <VideoPreview
        title={selected.file.name}
        meta={`${formatDuration(selected.durationSeconds)} · ${formatBytes(selected.file.size)} · Device storage`}
        primaryLabel={saving ? "Saving Securely..." : "Use Video"}
        secondaryLabel="Choose Another"
        video={selected.file}
        onSecondary={() => setSelected(null)}
        onCancel={back}
        onPrimary={useVideo}
      />
    );
  }

  return (
    <AppShell title="Select Video" subtitle={test.name} backTo="/battery">
      <input
        ref={input}
        type="file"
        accept="video/*"
        hidden
        onChange={(event) => void selectFile(event.target.files?.[0])}
      />

      <button
        onClick={() => input.current?.click()}
        className="flex w-full items-center gap-4 rounded-2xl bg-card p-5 text-left shadow-card transition-transform active:scale-[0.99]"
      >
        <span className="bg-gradient-primary grid size-12 shrink-0 place-items-center rounded-2xl text-primary-foreground">
          <FolderOpen className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold">Browse Device</span>
          <span className="block truncate text-sm text-muted-foreground">
            Open the file picker to choose any video
          </span>
        </span>
        <Film className="size-5 shrink-0 text-muted-foreground" />
      </button>

      <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-success" />
          Secure Offline Storage
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The selected video is encrypted and stored on this device before analysis begins.
        </p>
      </section>
    </AppShell>
  );
}

async function videoDuration(file: File) {
  const url = URL.createObjectURL(file);

  try {
    return await new Promise<number>((resolve) => {
      const video = document.createElement("video");
      video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : 0);
      video.onerror = () => resolve(0);
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainder = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${minutes}:${remainder}`;
}
