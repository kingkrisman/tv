import { memo, useState } from "react";
import { Globe, Heart, Lock } from "lucide-react";
import type { IndexedChannel } from "@/lib/channels";
import { cn } from "@/lib/utils";

/** Channel logo with a quiet monogram when the image is missing or broken. */
export const ChannelLogo = memo(function ChannelLogo({ channel, className }: { channel: IndexedChannel; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!channel.logo || failed) {
    const initials = channel.name
      .split(/\s+/)
      .filter((word) => /^[\p{L}\p{N}]/u.test(word))
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
    return <span className={cn("select-none font-mono text-sm font-medium tracking-tight text-mute", className)}>{initials || "TV"}</span>;
  }
  return <img src={channel.logo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn("object-contain", className)} />;
});

export function Equalizer() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 0.2, 0.4].map((delay) => (
        <span key={delay} className="h-full w-[2px] origin-bottom rounded-full bg-signal" style={{ animation: `eq 0.9s ease-in-out ${delay}s infinite` }} />
      ))}
    </span>
  );
}

/** "locked": region-locked with no proxy to reach it. "unlocked": region-locked, but the relay's proxy covers it. */
export type Region = "open" | "locked" | "unlocked";

type TileProps = {
  channel: IndexedChannel;
  active: boolean;
  favorite: boolean;
  offline: boolean;
  region: Region;
  onSelect: (channel: IndexedChannel) => void;
  onToggleFavorite: (id: string) => void;
};

export const ChannelTile = memo(function ChannelTile({ channel, active, favorite, offline, region, onSelect, onToggleFavorite }: TileProps) {
  const dimmed = (offline || region === "locked") && !active;
  return (
    <div className={cn("tile group relative rounded-xl transition-opacity", dimmed && "opacity-45 hover:opacity-100")}>
      <button
        onClick={() => onSelect(channel)}
        className={cn(
          // ring-inset: .tile uses content-visibility, which clips anything painted outside its box.
          "flex w-full flex-col overflow-hidden rounded-xl bg-surface text-left ring-1 ring-inset transition-[box-shadow,background-color] duration-200",
          active ? "ring-2 ring-signal" : "ring-line/[0.07] hover:ring-line/20",
        )}
      >
        <span className="relative grid aspect-[16/10] w-full place-items-center bg-raised/60">
          <ChannelLogo channel={channel} className="h-[46%] w-[62%] transition-transform duration-300 ease-out group-hover:scale-[1.06]" />
          {active && (
            <span className="absolute left-2.5 top-2.5 inline-flex h-5 items-center gap-1.5 rounded-full bg-surface/90 px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-ink">
              <Equalizer /> On
            </span>
          )}
          {!active && region === "locked" && (
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-medium text-mute" title={`Only plays from ${channel.countryName ?? "its home country"}`}>
              <Lock size={9} strokeWidth={2.5} /> Region-locked
            </span>
          )}
          {!active && region !== "locked" && offline && <span className="absolute left-2.5 top-2.5 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-medium text-mute">Offline</span>}
          {!active && region === "unlocked" && !offline && (
            <span className="absolute left-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-surface/90 text-mute" title={`Region-locked — unlocked through your ${channel.country ?? ""} relay proxy`}>
              <Globe size={10} />
            </span>
          )}
        </span>
        <span className="block w-full min-w-0 px-3 pb-3 pt-2.5">
          <span className="block truncate text-[13px] font-medium tracking-[-0.01em]">{channel.name}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-mute">
            {[channel.countryName, channel.groups[0]].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
      <button
        onClick={() => onToggleFavorite(channel.id)}
        aria-label={favorite ? `Remove ${channel.name} from saved` : `Save ${channel.name}`}
        aria-pressed={favorite}
        className={cn(
          "absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-surface/90 transition-[opacity,transform,color] duration-150 active:scale-90",
          favorite ? "text-signal opacity-100" : "text-mute opacity-0 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100",
        )}
      >
        <Heart size={13} fill={favorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
});

type RowProps = { channel: IndexedChannel; active: boolean; onSelect: (channel: IndexedChannel) => void; hint?: string };

export const ChannelRow = memo(function ChannelRow({ channel, active, onSelect, hint }: RowProps) {
  return (
    <button onClick={() => onSelect(channel)} className={cn("group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors duration-150", active ? "bg-line/[0.06]" : "hover:bg-line/[0.04]")}>
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-raised ring-1 ring-line/[0.05]">
        <ChannelLogo channel={channel} className="size-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{channel.name}</span>
        <span className="block truncate text-[11.5px] text-mute">{hint ?? [channel.countryName, channel.groups[0]].filter(Boolean).join(" · ")}</span>
      </span>
      {active && <Equalizer />}
    </button>
  );
});
