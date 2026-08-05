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
  // A Blob needs a temporary object URL before a video element can play it locally.
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    // Clear the previous preview when a user retries without selecting a replacement clip.
    if (!video) {
      setVideoUrl(null);
      return;
    }

    const url = URL.createObjectURL(video);
    setVideoUrl(url);
    // Revoke the URL on replacement or unmount to release the browser-managed blob memory.
    return () => URL.revokeObjectURL(url);
  }, [video]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-foreground text-background">
      <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-primary/20 blur-3xl" />
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

      <div className="relative mx-5 mt-5 flex-1 overflow-hidden rounded-3xl border border-background/20 bg-background/5 shadow-elevated">
        {videoUrl ? (
          // Native controls keep playback behavior accessible without duplicating media controls in React.
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
          className="bg-gradient-primary action-lift flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-primary-foreground hover:action-lift-hover"
        >
          <Check className="size-5" />
          {primaryLabel}
        </button>
        <button
          onClick={onSecondary}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-background/15 text-base font-semibold text-background transition-transform active:scale-[0.98]"
        >
          <RotateCcw className="size-5" />
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}
