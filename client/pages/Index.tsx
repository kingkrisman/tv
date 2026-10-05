import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Heart, Keyboard, Lock, Moon, RotateCw, Search, Share2, Shuffle, Sun, X } from "lucide-react";
import { toast } from "sonner";
import Player, { type PlayerHandle, type StreamStatus } from "@/components/Player";
import Logo, { LogoMark } from "@/components/Logo";
import SearchPalette from "@/components/SearchPalette";
import { ChannelLogo, ChannelRow, ChannelTile, type Region } from "@/components/ChannelTile";
import { isGeoTagged, relayUnlocks, useChannels, usePersistent, useRelayConfig, type IndexedChannel } from "@/lib/channels";
import { cn } from "@/lib/utils";

const PAGE = 48;
const OFFLINE_TTL = 6 * 60 * 60 * 1000;
const LOCKED_TTL = 24 * 60 * 60 * 1000;

function freshIds(map: Record<string, number>, ttl: number) {
  const cutoff = Date.now() - ttl;
  return new Set(Object.entries(map).filter(([, at]) => at > cutoff).map(([id]) => id));
}
type RailTab = "next" | "recent" | "saved";

function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#08080A" : "#FAFAF9");
    try {
      localStorage.setItem("dn-theme", theme);
    } catch {
      // Storage unavailable; the theme still applies for this visit.
    }
  }, [theme]);
  return [theme, setTheme] as const;
}

export default function Index() {
  const { channels, status, retry } = useChannels();
  const [theme, setTheme] = useTheme();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [favorites, setFavorites] = usePersistent<string[]>("dn-favorites", []);
  const [recent, setRecent] = usePersistent<string[]>("dn-recent", []);
  const [offlineAt, setOfflineAt] = usePersistent<Record<string, number>>("dn-offline", {});
  const [hideOffline, setHideOffline] = usePersistent("dn-hide-offline", false);
  const [lockedAt, setLockedAt] = usePersistent<Record<string, number>>("dn-locked", {});
  const [hideLocked, setHideLocked] = usePersistent("dn-hide-locked", false);
  const relay = useRelayConfig();
  const [category, setCategory] = useState("All");
  const [country, setCountry] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [visible, setVisible] = useState(PAGE);
  const [railTab, setRailTab] = useState<RailTab>("next");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const playerRef = useRef<PlayerHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(channels.map((channel) => [channel.id, channel])), [channels]);
  const active = activeId ? byId.get(activeId) ?? null : null;
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const offline = useMemo(() => freshIds(offlineAt, OFFLINE_TTL), [offlineAt]);
  const locked = useMemo(() => freshIds(lockedAt, LOCKED_TTL), [lockedAt]);
  const regionOf = useCallback(
    (channel: IndexedChannel): Region => (isGeoTagged(channel) || locked.has(channel.id) ? (relayUnlocks(relay, channel) ? "unlocked" : "locked") : "open"),
    [locked, relay],
  );
  // Channels not worth surfing to: known dead, or locked with no proxy to reach them.
  const unwatchable = useCallback((channel: IndexedChannel) => offline.has(channel.id) || regionOf(channel) === "locked", [offline, regionOf]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const channel of channels) for (const group of channel.groups) counts.set(group, (counts.get(group) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [channels]);

  const countries = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const channel of channels) {
      if (!channel.country) continue;
      const entry = counts.get(channel.country) ?? { name: channel.countryName ?? channel.country, count: 0 };
      entry.count++;
      counts.set(channel.country, entry);
    }
    return [...counts].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [channels]);

  const filtered = useMemo(() => {
    const terms = deferredQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return channels.filter(
      (channel) =>
        (category === "All" || channel.groups.includes(category)) &&
        (!country || channel.country === country) &&
        (!savedOnly || favoriteSet.has(channel.id)) &&
        (!hideOffline || !offline.has(channel.id) || channel.id === activeId) &&
        (!hideLocked || regionOf(channel) !== "locked" || channel.id === activeId) &&
        terms.every((term) => channel.search.includes(term)),
    );
  }, [channels, category, country, savedOnly, favoriteSet, hideOffline, offline, hideLocked, regionOf, activeId, deferredQuery]);

  useEffect(() => setVisible(PAGE), [category, country, savedOnly, deferredQuery, hideOffline, hideLocked]);

  // Infinite scroll: grow the grid as the sentinel approaches the viewport.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && setVisible((v) => v + PAGE), { rootMargin: "900px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [status, filtered.length]);

  const select = useCallback(
    (channel: IndexedChannel, options: { scroll?: boolean } = {}) => {
      setActiveId(channel.id);
      setRecent((ids) => [channel.id, ...ids.filter((id) => id !== channel.id)].slice(0, 24));
      const url = new URL(location.href);
      url.searchParams.set("c", channel.id);
      history.replaceState(null, "", url);
      if (options.scroll !== false && stageRef.current && stageRef.current.getBoundingClientRect().top < -80) {
        stageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [setRecent],
  );

  // Open the channel named in the URL once the guide arrives.
  useEffect(() => {
    if (status !== "ready" || activeId) return;
    const id = new URL(location.href).searchParams.get("c");
    const channel = id ? byId.get(id) : undefined;
    if (channel) select(channel, { scroll: false });
  }, [status, byId, activeId, select]);

  const toggleFavorite = useCallback(
    (id: string) => setFavorites((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [id, ...ids])),
    [setFavorites],
  );

  const onStatus = useCallback(
    (id: string, state: StreamStatus) => {
      const mark = (map: Record<string, number>, on: boolean) => {
        if (on) return { ...map, [id]: Date.now() };
        if (!(id in map)) return map;
        const { [id]: _, ...rest } = map;
        return rest;
      };
      setOfflineAt((map) => mark(map, state === "offline"));
      setLockedAt((map) => mark(map, state === "locked"));
    },
    [setOfflineAt, setLockedAt],
  );

  const surfList = active && filtered.includes(active) ? filtered : channels;
  const surf = useCallback(
    (direction: 1 | -1) => {
      if (!surfList.length) return;
      const start = active ? surfList.indexOf(active) : -1;
      for (let step = 1; step <= surfList.length; step++) {
        const candidate = surfList[(start + direction * step + surfList.length * step) % surfList.length];
        if (!unwatchable(candidate)) return select(candidate, { scroll: false });
      }
    },
    [surfList, active, unwatchable, select],
  );
  const next = useCallback(() => surf(1), [surf]);
  const prev = useCallback(() => surf(-1), [surf]);

  const surprise = useCallback(() => {
    const pool = (filtered.length ? filtered : channels).filter((channel) => channel.logo && !unwatchable(channel) && channel.id !== activeId);
    if (pool.length) select(pool[Math.floor(Math.random() * pool.length)], { scroll: false });
  }, [filtered, channels, unwatchable, activeId, select]);

  const share = useCallback(async () => {
    if (!active) return;
    const url = `${location.origin}/?c=${active.id}`;
    try {
      if (navigator.share) await navigator.share({ title: active.name, text: `Watch ${active.name} live on Daniels Network`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copied", { description: `Anyone with it lands straight on ${active.name}.` });
      }
    } catch {
      // Share sheet dismissed.
    }
  }, [active]);

  // Title, and lock-screen / media-key controls.
  useEffect(() => {
    document.title = active ? `${active.name} · Daniels Network` : "Daniels Network";
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = active ? new MediaMetadata({ title: active.name, artist: "Daniels Network", artwork: active.logo ? [{ src: active.logo }] : [] }) : null;
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("previoustrack", prev);
  }, [active, next, prev]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      const target = event.target as HTMLElement;
      if (paletteOpen || event.ctrlKey || event.metaKey || event.altKey || target.closest("input, textarea, select, [contenteditable]")) return;
      const player = playerRef.current;
      const actions: Record<string, () => void> = {
        "/": () => setPaletteOpen(true),
        " ": () => player?.togglePlay(),
        k: () => player?.togglePlay(),
        m: () => player?.toggleMute(),
        f: () => player?.toggleFullscreen(),
        p: () => player?.togglePip(),
        n: next,
        b: prev,
        r: surprise,
        s: () => active && toggleFavorite(active.id),
        "=": () => player?.nudgeVolume(0.1),
        "+": () => player?.nudgeVolume(0.1),
        "-": () => player?.nudgeVolume(-0.1),
        "?": () => setHelpOpen((open) => !open),
        Escape: () => setHelpOpen(false),
      };
      const action = actions[event.key] ?? actions[event.key.toLowerCase()];
      if (!action) return;
      if (event.key === " " && target.closest("button")) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, next, prev, surprise, active, toggleFavorite]);

  // Warm the HLS engine while the guide loads, so the first tune-in is quick.
  useEffect(() => {
    const id = window.setTimeout(() => void import("hls.js"), 1200);
    return () => window.clearTimeout(id);
  }, []);

  const recentChannels = useMemo(() => recent.map((id) => byId.get(id)).filter((c): c is IndexedChannel => Boolean(c)), [recent, byId]);
  const savedChannels = useMemo(() => favorites.map((id) => byId.get(id)).filter((c): c is IndexedChannel => Boolean(c)), [favorites, byId]);
  const upNext = useMemo(() => {
    const list = surfList.filter((channel) => !unwatchable(channel) || channel.id === activeId);
    const start = active ? list.indexOf(active) + 1 : 0;
    return [...list.slice(start, start + 30), ...(start + 30 > list.length ? list.slice(0, Math.min(start, 30 - (list.length - start))) : [])];
  }, [surfList, unwatchable, activeId, active]);
  const railItems = railTab === "next" ? upNext : railTab === "recent" ? recentChannels : savedChannels;
  const isFavorite = active ? favoriteSet.has(active.id) : false;

  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-line/[0.06] bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <a href="/" aria-label="Daniels Network home" className="rounded-lg">
            <Logo />
          </a>
          <button onClick={() => setPaletteOpen(true)} className="ml-auto flex h-9 items-center gap-2.5 rounded-full bg-surface pl-3 pr-1.5 text-[13px] text-mute ring-1 ring-line/[0.08] transition-[box-shadow,color] hover:text-ink hover:ring-line/20 sm:w-64">
            <Search size={15} />
            <span className="hidden flex-1 text-left sm:block">Search channels</span>
            <span className="kbd hidden sm:inline-grid">/</span>
          </button>
          <button onClick={surprise} disabled={status !== "ready"} className="icon-btn disabled:opacity-40" aria-label="Surprise me" title="Surprise me (R)">
            <Shuffle size={17} />
          </button>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="icon-btn" aria-label="Toggle theme" title="Toggle theme">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button onClick={() => setHelpOpen(true)} className="icon-btn hidden sm:grid" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Keyboard size={17} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pb-20 sm:px-6 lg:px-8">
        <section ref={stageRef} className="scroll-mt-20 pt-6 sm:pt-8">
          <p className="mb-4 flex items-center gap-2.5 text-[12.5px] text-mute">
            <span className="live-dot" />
            {status === "ready" ? (
              <span>
                <span className="font-medium text-ink">{channels.length.toLocaleString()}</span> channels live from <span className="font-medium text-ink">{countries.length}</span> countries
              </span>
            ) : status === "loading" ? (
              "Tuning the guide…"
            ) : (
              "Guide offline"
            )}
          </p>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <div className="relative">
                {/* Ambient light: the channel's own colours, blurred behind the screen. */}
                <div aria-hidden="true" className="pointer-events-none absolute -inset-x-10 -inset-y-8 -z-10 overflow-hidden opacity-50 dark:opacity-35">
                  {active?.logo ? (
                    <img key={active.id} src={active.logo} alt="" referrerPolicy="no-referrer" className="animate-in fade-in-0 size-full object-cover blur-[80px] saturate-[1.8] duration-700" />
                  ) : (
                    <div className="size-full bg-[radial-gradient(ellipse_at_center,rgb(var(--signal)/0.18),transparent_65%)]" />
                  )}
                </div>
                <Player ref={playerRef} channel={active} regionLocked={active ? regionOf(active) !== "open" : false} relay={relay} onStatus={onStatus} onNext={next} onPrev={prev} onSurprise={surprise} />
              </div>

              <div className="mt-5 flex items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface ring-1 ring-line/[0.07]">
                  {active ? <ChannelLogo channel={active} className="size-8" /> : <LogoMark className="size-6" />}
                </span>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{active?.name ?? "Nothing on yet"}</h1>
                  <p className="truncate text-[13px] text-mute">
                    {active ? [active.countryName, active.groups.join(", "), active.quality, ...(active.tags ?? [])].filter(Boolean).join(" · ") : "Thousands of free channels, one quiet screen."}
                  </p>
                </div>
                {active && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => toggleFavorite(active.id)} aria-pressed={isFavorite} className={cn("inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium ring-1 transition-[background-color,color,box-shadow] active:scale-95", isFavorite ? "bg-signal/10 text-signal ring-signal/30" : "ring-line/10 hover:bg-line/[0.05]")}>
                      <Heart size={14} fill={isFavorite ? "currentColor" : "none"} />
                      <span className="hidden sm:inline">{isFavorite ? "Saved" : "Save"}</span>
                    </button>
                    <button onClick={share} className="icon-btn" aria-label="Share channel" title="Share">
                      <Share2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <aside className="relative min-h-[360px] lg:min-h-0">
              <div className="flex h-[420px] flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-line/[0.07] lg:absolute lg:inset-0 lg:h-auto">
                <div className="flex gap-1 border-b border-line/[0.06] p-1.5" role="tablist">
                  {(
                    [
                      ["next", "Up next"],
                      ["recent", "Recent"],
                      ["saved", `Saved${favorites.length ? ` ${favorites.length}` : ""}`],
                    ] as const
                  ).map(([tab, label]) => (
                    <button key={tab} role="tab" aria-selected={railTab === tab} onClick={() => setRailTab(tab)} className={cn("h-8 flex-1 rounded-lg text-[13px] font-medium transition-colors", railTab === tab ? "bg-line/[0.07] text-ink" : "text-mute hover:text-ink")}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="scroll-thin flex-1 overflow-y-auto p-1.5">
                  {status === "loading" && Array.from({ length: 7 }, (_, i) => <div key={i} className="m-2 h-10 animate-pulse rounded-lg bg-line/[0.05]" />)}
                  {railItems.map((channel) => (
                    <ChannelRow key={channel.id} channel={channel} active={channel.id === activeId} onSelect={select} />
                  ))}
                  {status === "ready" && railItems.length === 0 && (
                    <p className="px-6 py-14 text-center text-[13px] leading-relaxed text-mute">
                      {railTab === "saved" ? "Tap the heart on any channel to keep it here." : railTab === "recent" ? "Channels you watch will appear here." : "Nothing queued for these filters."}
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="mt-16" aria-labelledby="browse-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="browse-heading" className="text-2xl font-semibold tracking-[-0.03em]">Browse</h2>
              <p className="mt-1 text-[13px] text-mute">{status === "ready" ? `${filtered.length.toLocaleString()} ${filtered.length === 1 ? "channel" : "channels"}` : " "}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface px-3 ring-1 ring-line/[0.08] focus-within:ring-line/25 sm:w-56 sm:flex-none">
                <Search size={14} className="shrink-0 text-mute" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute" />
                {query && (
                  <button onClick={() => setQuery("")} aria-label="Clear filter" className="text-mute hover:text-ink">
                    <X size={14} />
                  </button>
                )}
              </label>
              <select value={country} onChange={(event) => setCountry(event.target.value)} aria-label="Country" className="h-9 max-w-[11rem] cursor-pointer appearance-none rounded-full bg-surface bg-[length:10px] bg-[right_0.8rem_center] bg-no-repeat pl-3.5 pr-8 text-[13px] ring-1 ring-line/[0.08] outline-none hover:ring-line/20" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6' fill='none' stroke='%23888' stroke-width='1.5'%3E%3Cpath d='M1 1l4 4 4-4'/%3E%3C/svg%3E\")" }}>
                <option value="">All countries</option>
                {countries.map(([code, { name, count }]) => (
                  <option key={code} value={code}>
                    {name} ({count})
                  </option>
                ))}
              </select>
              <button onClick={() => setSavedOnly((v) => !v)} data-active={savedOnly} className="chip ring-1 ring-line/[0.08]">
                <Heart size={13} fill={savedOnly ? "currentColor" : "none"} /> Saved
              </button>
              <button onClick={() => setHideOffline((v) => !v)} data-active={hideOffline} className="chip ring-1 ring-line/[0.08]" title="Hide channels that failed to play recently">
                Hide offline
              </button>
              <button onClick={() => setHideLocked((v) => !v)} data-active={hideLocked} className="chip ring-1 ring-line/[0.08]" title="Hide channels that only play from another country">
                <Lock size={12} /> Hide region-locked
              </button>
            </div>
          </div>

          <div className="relative -mx-4 mt-5 sm:-mx-6 lg:-mx-8">
            <div className="scrollbar-none flex gap-1 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-32px),transparent)] sm:px-6 lg:px-8">
              {[["All", channels.length] as const, ...categories].map(([name, count]) => (
                <button key={name} onClick={() => setCategory(name)} data-active={category === name} className="chip">
                  {name}
                  <span className={cn("font-mono text-[10.5px]", category === name ? "text-canvas/60" : "text-mute/70")}>{count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {status === "loading" &&
              Array.from({ length: 18 }, (_, i) => (
                <div key={i} className="overflow-hidden rounded-xl bg-surface ring-1 ring-line/[0.06]">
                  <div className="aspect-[16/10] animate-pulse bg-line/[0.04]" />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-3/4 rounded bg-line/[0.06]" />
                    <div className="h-2.5 w-1/2 rounded bg-line/[0.04]" />
                  </div>
                </div>
              ))}
            {filtered.slice(0, visible).map((channel) => (
              <ChannelTile key={channel.id} channel={channel} active={channel.id === activeId} favorite={favoriteSet.has(channel.id)} offline={offline.has(channel.id)} region={regionOf(channel)} onSelect={select} onToggleFavorite={toggleFavorite} />
            ))}
          </div>
          {visible < filtered.length && <div ref={sentinelRef} className="h-px" />}

          {status === "ready" && filtered.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-line/10 px-6 py-16 text-center">
              <p className="font-medium">{savedOnly && favorites.length === 0 ? "No saved channels yet" : "Nothing matches"}</p>
              <p className="mt-1 text-[13px] text-mute">{savedOnly && favorites.length === 0 ? "Hover a channel and tap the heart to save it." : "Try a different category, country or spelling."}</p>
              <button
                onClick={() => {
                  setCategory("All");
                  setCountry("");
                  setSavedOnly(false);
                  setQuery("");
                }}
                className="mt-5 h-9 rounded-full bg-ink px-4 text-[13px] font-medium text-canvas transition-transform active:scale-95"
              >
                Reset filters
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="mt-6 rounded-2xl bg-surface px-6 py-16 text-center ring-1 ring-line/[0.07]">
              <p className="font-medium">The guide didn’t load</p>
              <p className="mt-1 text-[13px] text-mute">Check your connection, then try again.</p>
              <button onClick={retry} className="mt-5 inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-canvas transition-transform active:scale-95">
                <RotateCw size={14} /> Try again
              </button>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-line/[0.06]">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-8 text-[12.5px] text-mute sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="flex items-center gap-2.5">
            <LogoMark className="size-5" /> Daniels Network · Public broadcasts, listed by iptv-org.
          </span>
          <button onClick={() => setHelpOpen(true)} className="flex items-center gap-2 self-start transition-colors hover:text-ink sm:self-auto">
            Press <span className="kbd">?</span> for shortcuts
          </button>
        </div>
      </footer>

      <SearchPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} channels={channels} suggestions={recentChannels.length ? recentChannels : savedChannels} onSelect={select} />
      {helpOpen && <ShortcutsSheet onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["/"], "Search"],
  [["Space"], "Play / pause"],
  [["N"], "Next channel"],
  [["B"], "Previous channel"],
  [["R"], "Surprise me"],
  [["S"], "Save channel"],
  [["M"], "Mute"],
  [["+", "−"], "Volume"],
  [["F"], "Full screen"],
  [["P"], "Picture in picture"],
];

function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-[2px] animate-in fade-in-0 duration-150" onMouseDown={onClose}>
      <div role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-surface p-2 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)] ring-1 ring-line/10 animate-in fade-in-0 zoom-in-[0.98] duration-200">
        <div className="flex items-center justify-between px-3 pb-2 pt-2">
          <p className="text-sm font-semibold">Shortcuts</p>
          <button onClick={onClose} className="icon-btn size-7" aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <ul>
          {SHORTCUTS.map(([keys, label]) => (
            <li key={label} className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px]">
              <span className="text-mute">{label}</span>
              <span className="flex gap-1">
                {keys.map((key) => (
                  <span key={key} className="kbd px-1.5">
                    {key}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
