import { cn } from "@/lib/utils";

/** The mark: a "D" drawn as a lens, with the on-air light at its centre. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-ink" />
      <path d="M11 8.5h5a7.5 7.5 0 0 1 0 15h-5z" fill="none" strokeWidth="2.4" strokeLinejoin="round" className="stroke-canvas" />
      <circle cx="16" cy="16" r="2.3" className="fill-signal" />
    </svg>
  );
}

export default function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">
        Daniels<span className="font-normal text-mute"> Network</span>
      </span>
    </span>
  );
}
