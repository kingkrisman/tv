import { Link } from "react-router-dom";
import { LogoMark } from "@/components/Logo";

const NotFound = () => (
  <div className="grid min-h-dvh place-items-center px-6">
    <div className="animate-rise text-center">
      <LogoMark className="mx-auto size-12" />
      <p className="mt-8 font-mono text-[12px] uppercase tracking-[0.12em] text-mute">No signal · 404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">This channel doesn’t exist.</h1>
      <Link to="/" className="mt-8 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-canvas transition-transform active:scale-95">
        Back to live TV
      </Link>
    </div>
  </div>
);

export default NotFound;
