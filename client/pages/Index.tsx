import {
  Bell,
  ChevronDown,
  Clapperboard,
  Globe2,
  Heart,
  LoaderCircle,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tv,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Channel = {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  url: string;
};

const PLAYLIST_URL = "https://iptv-org.github.io/iptv/index.m3u";

const demoChannels: Channel[] = [
  { id: "1", name: "Bloomberg TV", group: "Business", url: "" },
  { id: "2", name: "France 24 English", group: "News", url: "" },
  { id: "3", name: "Al Jazeera English", group: "News", url: "" },
  { id: "4", name: "NASA TV", group: "Science", url: "" },
  { id: "5", name: "FashionTV", group: "Lifestyle", url: "" },
  { id: "6", name: "Red Bull TV", group: "Sports", url: "" },
];

function parsePlaylist(playlist: string): Channel[] {
  const lines = playlist.split(/\r?\n/);
  const parsed: Channel[] = [];
  let current: Omit<Channel, "url"> | null = null;

  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      const name = line.split(",").slice(1).join(",").trim() || "Untitled channel";
      const attr = (attribute: string) =>
        line.match(new RegExp(`${attribute}="([^"]*)"`))?.[1];
      current = {
        id: attr("tvg-id") || `${name}-${parsed.length}`,
        name,
        logo: attr("tvg-logo"),
        group: attr("group-title") || "General",
      };
    } else if (current && line.trim() && !line.startsWith("#")) {
      parsed.push({ ...current, url: line.trim() });
      current = null;
    }
  }

  return parsed;
}

export default function Index() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("Explore");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();

    fetch(PLAYLIST_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Playlist unavailable");
        return response.text();
      })
      .then((playlist) => {
        const loadedChannels = parsePlaylist(playlist);
        setChannels(loadedChannels);
        setActiveChannel(loadedChannels[0] ?? null);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setChannels(demoChannels);
        setActiveChannel(demoChannels[0]);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  const groups = useMemo(() => {
    const unique = Array.from(new Set(channels.map((channel) => channel.group).filter(Boolean))).slice(0, 7);
    return ["Explore", ...unique];
  }, [channels]);

  const filteredChannels = useMemo(() => {
    const search = query.toLowerCase().trim();
    return channels
      .filter((channel) => activeGroup === "Explore" || channel.group === activeGroup)
      .filter((channel) => !search || `${channel.name} ${channel.group}`.toLowerCase().includes(search))
      .slice(0, 30);
  }, [activeGroup, channels, query]);

  const selectChannel = (channel: Channel) => {
    setActiveChannel(channel);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#080a12] text-[#f7f7fb]">
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />

      <nav className="relative z-10 mx-auto flex max-w-[1480px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#a5ff51] text-[#10140d] shadow-[0_0_30px_rgba(165,255,81,0.22)]">
            <Tv size={21} strokeWidth={2.5} />
          </div>
          <span className="text-xl font-extrabold tracking-[-0.06em]">telly</span>
        </div>
        <div className="hidden items-center gap-8 text-sm font-medium text-[#9da0ad] md:flex">
          <button className="text-white">Live TV</button>
          <button className="transition hover:text-white">Discover</button>
          <button className="transition hover:text-white">My list</button>
        </div>
        <div className="flex items-center gap-3">
          <button className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.045] text-[#d8d9e0] transition hover:bg-white/10" aria-label="Notifications">
            <Bell size={17} />
          </button>
          <button className="hidden h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 text-sm font-semibold sm:flex">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-[#f5a5eb] to-[#8677fa] text-[10px] text-white">CD</span>
            <ChevronDown size={14} />
          </button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-[1480px] px-5 pb-14 pt-6 sm:px-8 lg:px-12 lg:pt-12">
        <div className="grid items-end gap-5 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#a5ff51]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#a5ff51]" /> Live now</div>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[0.97] tracking-[-0.065em] sm:text-6xl lg:text-7xl">TV from around<br className="hidden sm:block" /> the world, <em className="font-serif font-normal text-[#c7c6d0]">right now.</em></h1>
          </div>
          <p className="max-w-[300px] pb-1 text-sm leading-6 text-[#a7a7b3]">A constantly changing collection of free live channels, curated from the open web.</p>
        </div>

        <div className="mt-10 grid gap-7 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.65fr)]">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#11131d] shadow-2xl shadow-black/30">
            <div className="relative aspect-video overflow-hidden bg-[radial-gradient(circle_at_58%_35%,#3a1c62_0%,#211535_31%,#11131d_73%)]">
              {activeChannel?.url ? (
                <video key={activeChannel.url} className="h-full w-full object-cover" src={activeChannel.url} controls autoPlay muted playsInline />
              ) : (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10"><Play fill="currentColor" size={25} /></div><p className="mt-4 text-sm text-white/60">Choose a channel to start watching</p></div>
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#10111a]/80 to-transparent" />
              <div className="absolute bottom-5 left-5 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white text-[#14141e]">
                  {activeChannel?.logo ? <img src={activeChannel.logo} alt="" className="h-full w-full object-contain p-1" /> : <Clapperboard size={19} />}
                </div>
                <div><p className="text-sm font-bold">{activeChannel?.name ?? "Loading channels"}</p><p className="text-xs text-white/55">{activeChannel?.group ?? "Live television"}</p></div>
              </div>
              <div className="absolute bottom-5 right-5 flex items-center gap-2 rounded-full bg-black/35 px-3 py-2 text-xs font-semibold text-white/80 backdrop-blur-sm"><Volume2 size={14} /> Live</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-2 text-sm text-[#9fa1ad]"><span className="font-bold text-[#a5ff51]">ON AIR</span><span className="h-1 w-1 rounded-full bg-[#5e6070]" /> Worldwide public streams</div>
              <button className="flex items-center gap-2 text-sm font-semibold text-white/70 transition hover:text-white"><Heart size={16} /> Save channel</button>
            </div>
          </div>

          <aside className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 xl:p-6">
            <div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a5ff51]">Up next</p><h2 className="mt-1 text-xl font-bold tracking-[-0.04em]">Freshly tuned</h2></div><Sparkles size={19} className="text-[#ded4ff]" /></div>
            <div className="space-y-3">
              {filteredChannels.slice(1, 5).map((channel, index) => <button key={channel.id + channel.url} onClick={() => selectChannel(channel)} className="group flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-white/[0.07]">
                <span className="w-4 text-xs font-bold text-[#696b77]">0{index + 1}</span>
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#242533] text-[#c5c6cf]">{channel.logo ? <img src={channel.logo} alt="" className="h-full w-full object-contain p-1" /> : <Tv size={16} />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{channel.name}</span><span className="mt-0.5 block text-xs text-[#898b97]">{channel.group}</span></span>
                <Play size={15} className="text-[#a5ff51] opacity-0 transition group-hover:opacity-100" fill="currentColor" />
              </button>)}
              {status === "loading" && <div className="flex items-center gap-3 px-2 py-5 text-sm text-[#9698a4]"><LoaderCircle size={17} className="animate-spin text-[#a5ff51]" /> Gathering live channels…</div>}
            </div>
          </aside>
        </div>
      </section>

      <section className="relative z-10 border-t border-white/[0.08] bg-[#0c0e16]/80 py-10 backdrop-blur-sm">
        <div className="mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-12">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#a5ff51]"><Globe2 size={14} /> Channel guide</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.055em]">Find your next window.</h2></div>
            <div className="flex w-full items-center gap-3 md:w-auto">
              <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-[#92949e] md:w-64"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search channels" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#777985]" /></label>
              <button className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.045] text-[#c8c9d1]" aria-label="Filter channels"><SlidersHorizontal size={17} /></button>
            </div>
          </div>
          <div className="mt-7 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {groups.map((group) => <button key={group} onClick={() => setActiveGroup(group)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${activeGroup === group ? "bg-[#a5ff51] text-[#10140d]" : "border border-white/10 bg-white/[0.035] text-[#a6a8b3] hover:border-white/25 hover:text-white"}`}>{group}</button>)}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {filteredChannels.slice(0, 15).map((channel) => <button key={channel.id + channel.url} onClick={() => selectChannel(channel)} className={`group flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition ${activeChannel?.url === channel.url ? "border-[#a5ff51]/50 bg-[#a5ff51]/[0.09]" : "border-white/[0.08] bg-white/[0.025] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]"}`}>
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#1f202d] text-[#b7b8c2]">{channel.logo ? <img src={channel.logo} alt="" className="h-full w-full object-contain p-1" /> : <Tv size={18} />}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-bold">{channel.name}</span><span className="mt-0.5 block truncate text-xs text-[#858792]">{channel.group}</span></span>
            </button>)}
          </div>
          {status === "error" && <p className="mt-5 text-sm text-[#a6a8b3]">The live guide is temporarily unavailable. Showing a sample guide while it reconnects.</p>}
        </div>
      </section>
    </main>
  );
}
