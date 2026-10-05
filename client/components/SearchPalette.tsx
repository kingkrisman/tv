import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import type { IndexedChannel } from "@/lib/channels";
import { ChannelLogo } from "@/components/ChannelTile";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  channels: IndexedChannel[];
  suggestions: IndexedChannel[];
  onSelect: (channel: IndexedChannel) => void;
};

const LIMIT = 40;

function rank(channels: IndexedChannel[], query: string) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const starts: IndexedChannel[] = [];
  const contains: IndexedChannel[] = [];
  for (const channel of channels) {
    if (!terms.every((term) => channel.search.includes(term))) continue;
    if (channel.name.toLowerCase().startsWith(q)) starts.push(channel);
    else contains.push(channel);
    if (starts.length >= LIMIT) break;
  }
  return [...starts, ...contains].slice(0, LIMIT);
}

export default function SearchPalette({ open, onClose, channels, suggestions, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => (deferred.trim() ? rank(channels, deferred) : suggestions.slice(0, 8)), [channels, deferred, suggestions]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  useEffect(() => setCursor(0), [deferred]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const choose = (channel?: IndexedChannel) => {
    if (!channel) return;
    onSelect(channel);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px] animate-in fade-in-0 duration-150" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Search channels"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)] ring-1 ring-line/10 animate-in fade-in-0 zoom-in-[0.98] slide-in-from-top-2 duration-200"
      >
        <label className="flex h-14 items-center gap-3 border-b border-line/[0.07] px-4">
          <Search size={18} className="shrink-0 text-mute" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(results[cursor]);
              } else if (event.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Channels, countries, categories…"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mute"
            aria-activedescendant={results[cursor] ? `result-${results[cursor].id}` : undefined}
          />
          <span className="kbd">esc</span>
        </label>
        <div ref={listRef} role="listbox" className="scroll-thin max-h-[min(60vh,440px)] overflow-y-auto p-2">
          {!deferred.trim() && results.length > 0 && <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-mute">Jump back in</p>}
          {results.map((channel, i) => (
            <button
              key={channel.id}
              id={`result-${channel.id}`}
              data-index={i}
              role="option"
              aria-selected={i === cursor}
              onMouseMove={() => setCursor(i)}
              onClick={() => choose(channel)}
              className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left", i === cursor && "bg-line/[0.06]")}
            >
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-raised">
                <ChannelLogo channel={channel} className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{channel.name}</span>
                <span className="block truncate text-xs text-mute">{[channel.countryName, channel.groups.join(", "), channel.quality].filter(Boolean).join(" · ")}</span>
              </span>
              {i === cursor && <CornerDownLeft size={14} className="shrink-0 text-mute" />}
            </button>
          ))}
          {deferred.trim() && results.length === 0 && <p className="px-3 py-10 text-center text-sm text-mute">Nothing on air matches “{deferred}”.</p>}
          {!deferred.trim() && results.length === 0 && <p className="px-3 py-10 text-center text-sm text-mute">Type to search {channels.length.toLocaleString()} channels.</p>}
        </div>
        <div className="flex items-center gap-4 border-t border-line/[0.07] px-4 py-2.5 text-[11.5px] text-mute">
          <span className="flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span className="flex items-center gap-1.5"><span className="kbd">↵</span> watch</span>
        </div>
      </div>
    </div>
  );
}
