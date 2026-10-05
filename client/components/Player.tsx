import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Lock, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCw, Shuffle, Volume2, VolumeX } from "lucide-react";
import type HlsType from "hls.js";
import type { MediaPlayerClass } from "dashjs";
import type { RelayConfig } from "@shared/api";
import { playbackSources, relayUnlocks, usePersistent, type IndexedChannel } from "@/lib/channels";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

export type PlayerHandle = {
  togglePlay: () => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  togglePip: () => void;
  nudgeVolume: (delta: number) => void;
};

export type StreamStatus = "online" | "offline" | "locked";

type Props = {
  channel: IndexedChannel | null;
  /** Tagged geo-blocked by the playlist, or refused by region on an earlier attempt. */
  regionLocked: boolean;
  relay: RelayConfig;
  onStatus: (id: string, status: StreamStatus) => void;
  onNext: () => void;
  onPrev: () => void;
  onSurprise: () => void;
};

type Phase = "idle" | "loading" | "playing" | "error";

const LOAD_TIMEOUT = 15_000;

const Player = forwardRef<PlayerHandle, Props>(function Player({ channel, regionLocked, relay, onStatus, onNext, onPrev, onSurprise }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<"offline" | "locked">("offline");
  const [playback, setPlayback] = useState({ id: "", attempt: 0, retry: 0 });
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [height, setHeight] = useState(0);
  const [muted, setMuted] = usePersistent("dn-muted", false);
  const [volume, setVolume] = usePersistent("dn-volume", 0.8);
  const [autoMuted, setAutoMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [chrome, setChrome] = useState(true);
  const hideTimer = useRef<number>();

  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const unlockable = channel ? relayUnlocks(relay, channel) : false;
  const sources = channel ? playbackSources(channel, { regionLocked, relay }) : [];
  const sourcesKey = sources.join("\n");
  // Attempts are counted per source list, so a changed list (e.g. relay-only once locked) starts over.
  const playbackId = channel ? `${channel.id}\n${sourcesKey}` : "";
  const attempt = playback.id === playbackId ? playback.attempt : 0;
  const retry = playback.id === playbackId ? playback.retry : 0;

  // Load the stream for the current channel and source attempt.
  useEffect(() => {
    const video = videoRef.current;
    if (!channel || !video) {
      setPhase("idle");
      return;
    }
    const source = sources[attempt];
    // Set when any request is refused with 403/451, the signature of a regional block.
    let refused = false;
    const kind = /\.mpd(?:$|[?#])/i.test(channel.url) ? "dash" : /\.m3u8(?:$|[?#])/i.test(channel.url) ? "hls" : "other";
    let cancelled = false;
    let hls: HlsType | null = null;
    let dash: MediaPlayerClass | null = null;

    setPhase("loading");
    setBuffering(false);
    setHeight(0);
    setAutoMuted(false);
    video.volume = volume;

    const fail = () => {
      if (cancelled) return;
      cancelled = true;
      if (attempt < sources.length - 1) {
        setPlayback({ id: playbackId, attempt: attempt + 1, retry });
      } else {
        const outcome = refused || regionLocked ? "locked" : "offline";
        setFailure(outcome);
        setPhase("error");
        onStatusRef.current(channel.id, outcome);
      }
    };
    const ready = () => {
      if (cancelled) return;
      window.clearTimeout(watchdog);
      setPhase("playing");
      onStatusRef.current(channel.id, "online");
    };
    const play = () => {
      video.muted = mutedRef.current;
      video.play().catch((error: DOMException) => {
        if (cancelled || error.name !== "NotAllowedError") return;
        // Autoplay with sound was refused; start muted and offer to unmute.
        video.muted = true;
        setAutoMuted(true);
        video.play().catch(() => undefined);
      });
    };
    const playNative = () => {
      video.src = source;
      play();
    };

    const watchdog = window.setTimeout(fail, LOAD_TIMEOUT);
    video.addEventListener("loadeddata", ready);
    video.addEventListener("error", fail);

    (async () => {
      if (kind === "dash") {
        const dashjs = await import("dashjs");
        if (cancelled) return;
        dash = dashjs.MediaPlayer().create();
        dash.on(dashjs.MediaPlayer.events.ERROR, fail);
        dash.initialize(video, source, false);
        play();
        return;
      }
      const { default: Hls } = await import("hls.js");
      if (cancelled) return;
      if (!Hls.isSupported()) {
        // Safari on iOS: native HLS, no MediaSource.
        playNative();
        return;
      }
      let recoveredMedia = false;
      const instance = new Hls({
        enableWorker: true,
        backBufferLength: 30,
        maxBufferLength: 20,
        capLevelToPlayerSize: true,
        startFragPrefetch: true,
        manifestLoadingMaxRetry: 1,
        levelLoadingMaxRetry: 2,
        fragLoadingMaxRetry: 3,
      });
      hls = instance;
      instance.on(Hls.Events.MANIFEST_PARSED, play);
      instance.on(Hls.Events.ERROR, (_event, data) => {
        const code = data.response?.code;
        if (code === 403 || code === 451) refused = true;
        if (!data.fatal || cancelled) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
          recoveredMedia = true;
          instance.recoverMediaError();
          return;
        }
        if (kind === "other" && data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR) {
          // Not an HLS playlist after all; let the browser try it as a plain media file.
          instance.destroy();
          hls = null;
          playNative();
          return;
        }
        fail();
      });
      instance.loadSource(source);
      instance.attachMedia(video);
    })().catch(fail);

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("error", fail);
      hls?.destroy();
      dash?.reset();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
    // Volume is applied live by its own effect; it must not restart the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id, attempt, retry, sourcesKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    if (!autoMuted) video.muted = muted;
  }, [muted, volume, autoMuted]);

  useEffect(() => {
    const video = videoRef.current!;
    const sync = () => setPaused(video.paused);
    const waiting = () => setBuffering(true);
    const playing = () => setBuffering(false);
    const resize = () => setHeight(video.videoHeight);
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    video.addEventListener("waiting", waiting);
    video.addEventListener("playing", playing);
    video.addEventListener("resize", resize);
    const fs = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", fs);
    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
      video.removeEventListener("waiting", waiting);
      video.removeEventListener("playing", playing);
      video.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", fs);
    };
  }, []);

  const wake = useCallback(() => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || phase !== "playing") return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  }, [phase]);

  const toggleMute = useCallback(() => {
    if (autoMuted) {
      setAutoMuted(false);
      setMuted(false);
      return;
    }
    setMuted((m) => !m);
  }, [autoMuted, setMuted]);

  const toggleFullscreen = useCallback(() => {
    const frame = frameRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else if (frame?.requestFullscreen) frame.requestFullscreen().catch(() => undefined);
    else video?.webkitEnterFullscreen?.();
  }, []);

  const togglePip = useCallback(() => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled || phase !== "playing") return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => undefined);
    else video.requestPictureInPicture().catch(() => undefined);
  }, [phase]);

  const nudgeVolume = useCallback(
    (delta: number) => {
      setAutoMuted(false);
      setMuted(false);
      setVolume((v) => Math.min(1, Math.max(0, Math.round((v + delta) * 100) / 100)));
      wake();
    },
    [setMuted, setVolume, wake],
  );

  useImperativeHandle(ref, () => ({ togglePlay, toggleMute, toggleFullscreen, togglePip, nudgeVolume }), [togglePlay, toggleMute, toggleFullscreen, togglePip, nudgeVolume]);

  const isMuted = muted || autoMuted;
  const showChrome = chrome || paused || phase !== "playing";
  const quality = height >= 2160 ? "4K" : height >= 1080 ? "HD 1080" : height >= 720 ? "HD 720" : height > 0 ? `${height}p` : channel?.quality;

  return (
    <div
      ref={frameRef}
      onMouseMove={wake}
      onMouseLeave={() => setChrome(false)}
      onTouchStart={wake}
      className={cn("group relative aspect-video w-full overflow-hidden bg-black text-white", fullscreen ? "rounded-none" : "rounded-2xl ring-1 ring-line/[0.08]", !showChrome && "cursor-none")}
    >
      <video ref={videoRef} playsInline className="absolute inset-0 size-full object-contain" onClick={togglePlay} onDoubleClick={toggleFullscreen} />

      {phase === "idle" && (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06),transparent_60%)]">
          <div className="animate-rise flex flex-col items-center text-center">
            <LogoMark className="hidden size-12 sm:block [&_path]:stroke-black [&_rect]:fill-white" />
            <p className="text-base font-medium tracking-[-0.02em] sm:mt-6 sm:text-lg">Pick a channel to start watching</p>
            <p className="mt-1.5 hidden text-sm text-white/50 sm:block">
              Press <span className="kbd border-white/10 bg-white/10 text-white/70">/</span> to search everything
            </p>
            <button onClick={onSurprise} className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black transition-transform duration-150 hover:scale-[1.03] active:scale-95 sm:mt-6 sm:h-10 sm:px-5">
              <Shuffle size={15} /> Surprise me
            </button>
          </div>
        </div>
      )}

      {(phase === "loading" || (phase === "playing" && buffering)) && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-4">
            <span className="size-9 animate-spin rounded-full border-2 border-white/15 border-t-white" />
            {phase === "loading" && <p className="text-sm text-white/60">Tuning in{attempt > 0 ? " via relay" : ""}…</p>}
          </div>
        </div>
      )}

      {phase === "error" && channel && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 px-6">
          <div className="animate-rise text-center">
            {failure === "locked" ? (
              <>
                <span className="mx-auto mb-4 hidden size-10 place-items-center rounded-full bg-white/10 sm:grid">
                  <Lock size={17} />
                </span>
                <p className="text-lg font-medium tracking-[-0.02em]">{channel.name} is region-locked</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-white/50">
                  {unlockable ? (
                    <>The relay’s {channel.country ? `${channel.country} ` : ""}proxy was refused too. Try a different server for it in .env.local.</>
                  ) : (
                    <>
                      It only plays from {channel.countryName ?? "its home country"}. Connect a VPN there
                      {channel.country && (
                        <>
                          , or set <span className="font-mono text-white/70">STREAM_PROXY_{channel.country}</span> in .env.local to unlock it for everyone
                        </>
                      )}
                      .
                    </>
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium tracking-[-0.02em]">{channel.name} isn’t broadcasting</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-white/50">The stream may be offline or temporarily down.</p>
              </>
            )}
            <div className="mt-6 flex justify-center gap-2">
              <button onClick={() => setPlayback({ id: playbackId, attempt: 0, retry: retry + 1 })} className="inline-flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium transition-colors hover:bg-white/20">
                <RotateCw size={15} /> Retry
              </button>
              <button onClick={onNext} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black transition-transform hover:scale-[1.03] active:scale-95">
                Next channel <ChevronDown size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "playing" && autoMuted && (
        <button onClick={toggleMute} className="animate-rise absolute left-1/2 top-5 inline-flex h-9 -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium text-black shadow-lg">
          <VolumeX size={14} /> Tap to unmute
        </button>
      )}

      {channel && (phase === "loading" || phase === "playing") && (
        <div className={cn("pointer-events-none absolute inset-0 flex flex-col justify-between transition-opacity duration-300", showChrome ? "opacity-100" : "opacity-0")}>
          <div className="flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-4 sm:p-5">
            <span className="inline-flex h-6 items-center gap-2 rounded-full bg-black/40 px-2.5 text-[11px] font-medium uppercase tracking-[0.08em] backdrop-blur-md">
              <span className="live-dot" /> Live
            </span>
            {quality && <span className="inline-flex h-6 items-center rounded-full bg-black/40 px-2.5 font-mono text-[11px] text-white/80 backdrop-blur-md">{quality}</span>}
          </div>

          <div className="pointer-events-auto flex items-center gap-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-2 pt-12 sm:px-3 sm:pb-3">
            <ControlButton label={paused ? "Play" : "Pause"} onClick={togglePlay}>
              {paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
            </ControlButton>
            <ControlButton label={isMuted ? "Unmute" : "Mute"} onClick={toggleMute}>
              {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              aria-label="Volume"
              onChange={(event) => {
                setAutoMuted(false);
                setMuted(false);
                setVolume(Number(event.target.value));
              }}
              className="range hidden w-20 sm:block"
              style={{ "--fill": `${(isMuted ? 0 : volume) * 100}%` } as React.CSSProperties}
            />
            <div className="ml-3 hidden min-w-0 sm:block">
              <p className="truncate text-sm font-medium">{channel.name}</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <ControlButton label="Previous channel" onClick={onPrev}>
                <ChevronUp size={18} />
              </ControlButton>
              <ControlButton label="Next channel" onClick={onNext}>
                <ChevronDown size={18} />
              </ControlButton>
              {"pictureInPictureEnabled" in document && (
                <ControlButton label="Picture in picture" onClick={togglePip}>
                  <PictureInPicture2 size={17} />
                </ControlButton>
              )}
              <ControlButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
              </ControlButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid size-9 place-items-center rounded-full text-white/85 transition-[background-color,color,transform] duration-150 hover:bg-white/15 hover:text-white active:scale-90">
      {children}
    </button>
  );
}

export default Player;
