import {
  ChevronDown,
  Clapperboard,
  Globe2,
  Heart,
  LoaderCircle,
  Menu,
  Moon,
  Play,
  Search,
  Sun,
  Tv,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Channel = { id: string; name: string; logo?: string; group?: string; url: string };

type Theme = "light" | "dark";

const demoChannels: Channel[] = [
  { id: "1", name: "Bloomberg TV", group: "Business", url: "" },
  { id: "2", name: "France 24 English", group: "News", url: "" },
  { id: "3", name: "Al Jazeera English", group: "News", url: "" },
  { id: "4", name: "NASA TV", group: "Science", url: "" },
  { id: "5", name: "FashionTV", group: "Lifestyle", url: "" },
  { id: "6", name: "Red Bull TV", group: "Sports", url: "" },
];

function parsePlaylist(playlist: string): Channel[] {
  const parsed: Channel[] = [];
  let current: Omit<Channel, "url"> | null = null;
  for (const line of playlist.split(/\r?\n/)) {
    if (line.startsWith("#EXTINF:")) {
      const attr = (key: string) => line.match(new RegExp(`${key}="([^"]*)"`))?.[1];
      current = {
        id: attr("tvg-id") || `${parsed.length}`,
        name: line.split(",").slice(1).join(",").trim() || "Untitled channel",
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
  const [activeGroup, setActiveGroup] = useState("All channels");
  const [theme, setTheme] = useState<Theme>("light");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/iptv/playlist", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Playlist unavailable");
        return response.text();
      })
      .then((playlist) => {
        const loaded = parsePlaylist(playlist);
        setChannels(loaded);
        setActiveChannel(loaded[0] ?? null);
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

  const groups = useMemo(() => ["All channels", ...Array.from(new Set(channels.map((channel) => channel.group).filter(Boolean)))], [channels]);
  const filteredChannels = useMemo(() => {
    const search = query.toLowerCase().trim();
    return channels.filter((channel) => (activeGroup === "All channels" || channel.group === activeGroup) && (!search || `${channel.name} ${channel.group}`.toLowerCase().includes(search)));
  }, [activeGroup, channels, query]);

  const selectChannel = (channel: Channel) => {
    setActiveChannel(channel);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const isDark = theme === "dark";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 transition-colors dark:bg-slate-950 dark:text-white">
      <header className="border-b border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><Tv size={19} /></span><span className="text-xl font-extrabold tracking-tight">telly</span></div>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-500 md:flex dark:text-slate-400"><button className="text-blue-600 dark:text-blue-400">Live TV</button><button className="transition hover:text-blue-600">Guide</button><button className="transition hover:text-blue-600">Favorites</button></nav>
          <div className="flex items-center gap-2"><button onClick={() => setTheme(isDark ? "light" : "dark")} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800" aria-label="Toggle dark mode">{isDark ? <Sun size={18} /> : <Moon size={18} />}</button><button onClick={() => setMobileMenu(!mobileMenu)} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 md:hidden" aria-label="Toggle navigation">{mobileMenu ? <X size={19} /> : <Menu size={19} />}</button><button className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold sm:flex dark:border-slate-800"><span className="grid h-6 w-6 place-items-center rounded-full bg-blue-100 text-[10px] text-blue-700 dark:bg-blue-950 dark:text-blue-300">CD</span><ChevronDown size={14} /></button></div>
        </div>
        {mobileMenu && <div className="border-t border-slate-200 px-5 py-4 md:hidden dark:border-slate-800"><div className="flex flex-col gap-4 text-sm font-semibold text-slate-600 dark:text-slate-300"><button className="text-left text-blue-600">Live TV</button><button className="text-left">Guide</button><button className="text-left">Favorites</button></div></div>}
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400"><span className="h-2 w-2 rounded-full bg-blue-600" /> Live television</p><h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Watch something good.</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Free live channels from around the world, all in one place.</p></div><div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Globe2 size={16} className="text-blue-600" /> {status === "loading" ? "Loading guide…" : `${channels.length.toLocaleString()} channels available`}</div></div>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.65fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="relative aspect-video bg-slate-900">
              {activeChannel?.url ? <video key={activeChannel.url} className="h-full w-full object-contain" src={activeChannel.url} controls autoPlay muted playsInline /> : <div className="absolute inset-0 grid place-items-center"><div className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30"><Play fill="currentColor" size={22} /></div><p className="mt-4 text-sm text-slate-400">Select a channel below to start watching</p></div></div>}
              <div className="absolute bottom-4 left-4 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-white text-slate-700">{activeChannel?.logo ? <img src={activeChannel.logo} alt="" className="h-full w-full object-contain p-1" /> : <Clapperboard size={17} />}</span><div><p className="text-sm font-bold text-white">{activeChannel?.name ?? "Live channels"}</p><p className="text-xs text-slate-300">{activeChannel?.group ?? "Worldwide"}</p></div></div><span className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-md bg-black/50 px-2.5 py-1.5 text-xs text-white"><Volume2 size={13} /> LIVE</span>
            </div>
            <div className="flex items-center justify-between px-5 py-4"><div><p className="text-sm font-bold">{activeChannel?.name ?? "Choose a channel"}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{activeChannel?.group ?? "Your selected channel will appear here"}</p></div><button className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"><Heart size={16} /> Save</button></div>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Quick picks</p><h2 className="mt-1 text-lg font-bold">On air now</h2></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">Live</span></div><div className="space-y-1">{filteredChannels.slice(0, 5).map((channel) => <button key={channel.id + channel.url} onClick={() => selectChannel(channel)} className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">{channel.logo ? <img src={channel.logo} alt="" className="h-full w-full object-contain p-1" /> : <Tv size={15} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{channel.name}</span><span className="block truncate text-xs text-slate-500 dark:text-slate-400">{channel.group}</span></span><Play size={14} className="text-blue-600 opacity-0 transition group-hover:opacity-100" fill="currentColor" /></button>)}{status === "loading" && <div className="flex items-center gap-2 py-5 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin text-blue-600" /> Loading channels…</div>}</div></aside>
        </section>

        <section className="mt-12"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-extrabold tracking-tight">Channel guide</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Browse the complete live channel directory.</p></div><label className="flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-400 sm:w-64 dark:border-slate-800 dark:bg-slate-900"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search channels" className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" /></label></div><div className="mt-6 flex gap-2 overflow-x-auto pb-2">{groups.map((group) => <button key={group} onClick={() => setActiveGroup(group)} className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${activeGroup === group ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20" : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"}`}>{group}</button>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredChannels.map((channel) => <button key={channel.id + channel.url} onClick={() => selectChannel(channel)} className={`group flex min-w-0 items-center gap-3 rounded-xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:bg-slate-900 dark:hover:border-blue-700 ${activeChannel?.url === channel.url ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 dark:border-slate-800"}`}><span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">{channel.logo ? <img src={channel.logo} alt="" className="h-full w-full object-contain p-1" /> : <Tv size={18} />}</span><span className="min-w-0"><span className="block truncate text-sm font-bold">{channel.name}</span><span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{channel.group}</span></span></button>)}</div>{status === "error" && <p className="mt-5 text-sm text-slate-500">The live guide is temporarily unavailable. Showing a sample guide.</p>}{status === "ready" && filteredChannels.length === 0 && <p className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">No channels match your search.</p>}</section>
      </div>
      <footer className="border-t border-slate-200 py-6 dark:border-slate-800"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 text-xs text-slate-500 sm:px-8"><span>telly · Live TV on the open web</span><span>Updated from IPTV-Org</span></div></footer>
    </main>
  );
}
