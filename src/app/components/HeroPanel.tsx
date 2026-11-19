import React from "react";
import { BookOpenCheck, Sparkles, ArrowRight, Radio, ClipboardCheck } from "lucide-react";

export function HeroPanel({ stats, onExamOnline }: { stats: { downloads: number; teachers: number; schools: number }; onExamOnline: () => void }) {
  const statItems = [
    { label: "Telechargements", value: stats.downloads, tone: "text-green-700" },
    { label: "Enseignants", value: stats.teachers, tone: "text-sky-700" },
    { label: "Ecoles abonnees", value: stats.schools, tone: "text-amber-700" },
  ];

  return (
    <section className="hero-panel">
      <div className="max-w-[1400px] mx-auto px-4 py-8 md:py-10 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-center">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-green-100 bg-white/80 px-3 py-1.5 text-xs font-black text-green-700 shadow-sm">
            <Sparkles size={13} />
            Catalogue scolaire congolais
          </div>

          <h1 className="mt-4 max-w-3xl text-3xl md:text-5xl font-black leading-[1.04] text-slate-950">
            Sujets d'examens pour reviser, publier et telecharger plus vite.
          </h1>

          <p className="mt-4 max-w-2xl text-sm md:text-base leading-7 text-slate-600">
            Grand public, enseignants independants et ecoles abonnees se retrouvent sur une seule plateforme pour partager des sujets,
            acheter ou telecharger les documents disponibles.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {["CEPE", "BEPC", "Baccalaureat", "College", "Lycee"].map(label => (
              <span key={label} className="soft-chip">{label}</span>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2 sm:max-w-xl">
            {statItems.map(item => (
              <div key={item.label} className="hero-stat">
                <p className={`text-2xl md:text-3xl font-black ${item.tone}`}>
                  {item.value.toLocaleString("fr-FR")}
                </p>
                <p className="mt-1 text-[11px] md:text-xs font-bold text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-md lg:justify-self-end">
          <div className="hero-visual">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Espace examens</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">Les examens en ligne</h2>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-green-600 to-teal-700 text-white flex items-center justify-center shadow-lg">
                <BookOpenCheck size={22} />
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5">
              <p className="text-sm font-bold leading-6 text-slate-700">Parcourez les examens annoncés, rejoignez une session à l’heure prévue et déposez votre copie depuis votre téléphone.</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white p-3 shadow-sm"><CalendarDaysIcon /><p className="mt-1 text-[10px] font-black text-slate-700">Annoncés</p></div>
                <div className="rounded-xl bg-white p-3 shadow-sm"><Radio size={17} className="mx-auto text-emerald-700" /><p className="mt-1 text-[10px] font-black text-slate-700">En direct</p></div>
                <div className="rounded-xl bg-white p-3 shadow-sm"><ClipboardCheck size={17} className="mx-auto text-emerald-700" /><p className="mt-1 text-[10px] font-black text-slate-700">Mes copies</p></div>
              </div>
              <button onClick={onExamOnline} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:from-emerald-800 hover:to-teal-800">
                Accéder aux examens en ligne <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CalendarDaysIcon() {
  return <BookOpenCheck size={17} className="mx-auto text-emerald-700" />;
}
