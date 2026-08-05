import { Check, PlayCircle, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

/** UI-only recorded/selected video preview with confirm + retry actions. */
export function VideoPreview({
  title,
  meta,
  primaryLabel,
  secondaryLabel,
  video,
  onPrimary,
  onSecondary,
  onCancel,
}: {
  title: string;
  meta: string;
  primaryLabel: string;
  secondaryLabel: string;
  video?: Blob;
  onPrimary: () => void;
  onSecondary: () => void;
  onCancel: () => void;
}) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!video) {
      setVideoUrl(null);
      return;
    }

    const url = URL.createObjectURL(video);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [video]);

  return (
    <div className="flex min-h-screen flex-col bg-foreground text-background">
      <header className="flex items-center gap-3 px-5 pt-6">
        <button
          onClick={onCancel}
          aria-label="Cancel"
          className="grid size-10 place-items-center rounded-full bg-background/15"
        >
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Video Preview</p>
          <p className="truncate text-xs text-background/70">{title}</p>
        </div>
      </header>

      <div className="mx-5 mt-5 flex-1 overflow-hidden rounded-3xl border border-background/20 bg-background/5">
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            playsInline
            className="h-full min-h-[380px] w-full bg-black object-contain"
          />
        ) : (
          <div className="grid h-full min-h-[380px] place-items-center px-6 text-center">
            <div>
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-background/10">
                <PlayCircle className="size-9" />
              </span>
              <p className="mt-4 font-display text-lg font-bold">Tap to play</p>
              <p className="mt-1 text-sm text-background/70">{meta}</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 px-5 pb-10 pt-6">
        <button
          onClick={onPrimary}
          className="bg-gradient-primary flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          <Check className="size-5" />
          {primaryLabel}
        </button>
        <button
          onClick={onSecondary}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-background/15 text-base font-semibold text-background transition-transform active:scale-[0.98]"
        >
          <RotateCcw className="size-5" />
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}
