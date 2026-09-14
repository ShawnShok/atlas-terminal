"use client";

import { Download, MonitorDown, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface NavigatorWithStandalone extends Navigator {
  readonly standalone?: boolean;
}

function runningStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as NavigatorWithStandalone).standalone);
}

export interface InstallAppButtonProps {
  readonly collapsed: boolean;
}

export function InstallAppButton({ collapsed }: InstallAppButtonProps) {
  const titleId = useId();
  const detailId = useId();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateDisplayMode = () => setInstalled(runningStandalone());
    const initialFrame = window.requestAnimationFrame(updateDisplayMode);
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowGuide(false);
    };

    displayMode.addEventListener("change", updateDisplayMode);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    return () => {
      window.cancelAnimationFrame(initialFrame);
      displayMode.removeEventListener("change", updateDisplayMode);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  useEffect(() => {
    if (!showGuide) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowGuide(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showGuide]);

  const install = async () => {
    if (!installPrompt) {
      setShowGuide(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  };

  if (installed) return null;

  return (
    <>
      <button
        className="nav-item nav-install-app"
        type="button"
        title="Install ATLAS app"
        aria-label="Install ATLAS as a standalone app"
        onClick={() => void install()}
      >
        <Download size={16} strokeWidth={1.7} aria-hidden />
        {!collapsed && <span>Install app</span>}
      </button>

      {showGuide ? (
        <div className="install-app-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowGuide(false);
        }}>
          <section className="install-app-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={detailId}>
            <header>
              <span className="install-app-mark" aria-hidden="true">A</span>
              <div><span>ATLAS DESKTOP</span><h2 id={titleId}>OPEN WITHOUT BROWSER TABS</h2></div>
              <button type="button" aria-label="Close install instructions" onClick={() => setShowGuide(false)}><X size={16} /></button>
            </header>
            <div className="install-app-copy" id={detailId}>
              <MonitorDown size={28} strokeWidth={1.4} aria-hidden="true" />
              <p>Install ATLAS once, then launch it from your Applications folder or Dock in its own standalone window.</p>
              <ol>
                <li><strong>Safari on Mac</strong><span>Choose File → Add to Dock.</span></li>
                <li><strong>Chrome or Edge</strong><span>Open the browser menu and choose Install ATLAS Terminal.</span></li>
                <li><strong>iPhone or iPad</strong><span>Tap Share, then Add to Home Screen.</span></li>
              </ol>
            </div>
            <footer><button type="button" onClick={() => setShowGuide(false)}>DONE</button></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
