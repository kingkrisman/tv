import "./global.css";

import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const App = () => {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (import.meta.env.PROD) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    // In development a cached shell only gets in the way of hot reload.
    else navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((r) => r.unregister()));
  }, []);

  return (
    <>
      <Toaster position="bottom-center" toastOptions={{ className: "!rounded-2xl !bg-surface !text-ink !ring-1 !ring-line/10 !border-0 !font-sans" }} />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

createRoot(document.getElementById("root")!).render(<App />);
