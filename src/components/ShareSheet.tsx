import { Bluetooth, FileText, Link2, Mail, MessageCircle, MessageSquare, Share2, Wifi, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const options = [
  { label: "WhatsApp", icon: MessageCircle },
  { label: "Email", icon: Mail },
  { label: "SMS", icon: MessageSquare },
  { label: "Nearby Share", icon: Wifi },
  { label: "Bluetooth", icon: Bluetooth },
  { label: "Copy Link", icon: Link2 },
  { label: "Share PDF", icon: FileText },
] as const;

/** UI-only share sheet placeholder mimicking the native mobile share dialog. */
export function ShareSheet({
  open,
  onClose,
  title = "Share Assessment Result",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Close share sheet"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
      />
      <div className="animate-in slide-in-from-bottom relative w-full max-w-2xl rounded-t-3xl bg-card p-5 pb-8 shadow-card duration-200">
        <div className="mx-auto h-1.5 w-12 rounded-full bg-secondary" />
        <div className="mt-4 flex items-center gap-3">
          <Share2 className="size-5 text-primary" />
          <h2 className="min-w-0 flex-1 truncate font-display text-base font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-3">
          {options.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => {
                toast.success(`Shared via ${label} (demo)`);
                onClose();
              }}
              className="flex flex-col items-center gap-2 rounded-2xl bg-secondary p-3 transition-transform active:scale-[0.96]"
            >
              <span className="bg-gradient-primary grid size-11 place-items-center rounded-2xl text-primary-foreground">
                <Icon className="size-5" />
              </span>
              <span className="text-center text-[11px] font-semibold leading-tight text-foreground">
                {label}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Placeholder share sheet — no data leaves the device.
        </p>
      </div>
    </div>
  );
}

export function useShareSheet() {
  const [open, setOpen] = useState(false);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
}
