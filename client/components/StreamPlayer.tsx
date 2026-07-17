import * as dashjs from "dashjs";
import Hls from "hls.js";
import { forwardRef, useEffect, useRef } from "react";

type StreamPlayerProps = {
  source: string;
  onError: () => void;
};

function isHlsSource(source: string) {
  return /\.m3u8(?:$|[?#])/i.test(source);
}

function isDashSource(source: string) {
  return /\.mpd(?:$|[?#])/i.test(source);
}

const StreamPlayer = forwardRef<HTMLVideoElement, StreamPlayerProps>(function StreamPlayer({ source, onError }, forwardedRef) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let dash: dashjs.MediaPlayerClass | null = null;
    const handleError = () => onErrorRef.current();

    if (isDashSource(source)) {
      dash = dashjs.MediaPlayer().create();
      dash.initialize(video, source, true);
      dash.on(dashjs.MediaPlayer.events.ERROR, handleError);
    } else if (isHlsSource(source) && !video.canPlayType("application/vnd.apple.mpegurl") && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) handleError();
      });
    } else if (isHlsSource(source) && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source;
    } else if (!isHlsSource(source) && !isDashSource(source)) {
      video.src = source;
    } else {
      handleError();
    }

    return () => {
      hls?.destroy();
      dash?.reset();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [source]);

  return (
    <video
      ref={(node) => {
        videoRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      className="h-full w-full object-contain"
      controls
      autoPlay
      muted
      playsInline
      onError={onError}
    />
  );
});

export default StreamPlayer;
