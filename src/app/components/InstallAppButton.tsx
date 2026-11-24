import React, { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(isStandalone);

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowInstructions(false);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      setShowInstructions(true);
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
    } catch {
      setShowInstructions(true);
    }
  };

  if (installed) return null;

  const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return <>
    <button type="button" onClick={() => void install()} title="Installer EduConnect sur cet appareil" aria-label="Installer EduConnect" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] font-black text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 sm:gap-2 sm:px-3.5">
      <Download size={14} /><span className="hidden sm:inline">Installer</span>
    </button>

    {showInstructions && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setShowInstructions(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="install-app-title" className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><Download size={22}/></div><button type="button" aria-label="Fermer" onClick={() => setShowInstructions(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
        <h2 id="install-app-title" className="mt-4 text-xl font-black text-slate-900">Ajouter EduConnect à votre appareil</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{isAppleMobile ? "Ouvrez le menu de partage du navigateur, puis choisissez « Sur l’écran d’accueil ». Si l’option n’apparaît pas, ouvrez le site dans Safari." : "Ouvrez le menu de votre navigateur, puis choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil »."}</p>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600"><Share2 size={16} className="shrink-0 text-emerald-700"/>{isAppleMobile ? "Le menu de partage peut être dans la barre d’adresse ou dans la barre d’outils." : "Si l’option n’existe pas, ce navigateur ne propose pas l’installation PWA sur cet appareil."}</div>
        <button type="button" onClick={() => setShowInstructions(false)} className="mt-5 w-full rounded-xl bg-emerald-800 py-3 text-xs font-black text-white hover:bg-emerald-900">Compris</button>
      </section>
    </div>}
  </>;
}
