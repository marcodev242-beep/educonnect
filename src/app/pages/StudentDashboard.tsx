import React, { useMemo, useState } from "react";
import { Download, Heart, BookOpen, Sparkles, GraduationCap, CheckCircle2, ArrowRight, ShoppingCart, Trash2 } from "lucide-react";
import { DashboardHeader } from "../components/DashboardHeader";
import { AuthUser, Paper } from "../types";

export function StudentDashboard({
  purchasedPapers,
  onLogout,
  onFeed,
  onExamCatalog,
  user,
  onViewProfile,
  cartPapers,
  onRemoveFromCart,
  onCheckoutCart,
}: {
  purchasedPapers: Paper[];
  onLogout: () => void;
  onFeed: () => void;
  onExamCatalog?: () => void;
  onViewProfile: () => void;
  user: AuthUser;
  cartPapers: Paper[];
  onRemoveFromCart: (paperId: string) => void;
  onCheckoutCart: () => void;
}) {
  const [tab, setTab] = useState<"purchases" | "cart" | "saved">("purchases");
  const cartTotal = cartPapers.reduce((sum, paper) => sum + paper.price, 0);
  const downloadPaper = (paper: Paper) => {
    if (!paper.fileUrl) return;
    const link = document.createElement("a");
    link.href = paper.fileUrl;
    link.download = `${(paper.title || "document").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const summary = useMemo(() => {
    const subjects = new Set(purchasedPapers.map((p) => p.subject));
    const levels = new Set(purchasedPapers.map((p) => p.level));
    return {
      total: purchasedPapers.length,
      subjects: subjects.size,
      levels: levels.size,
    };
  }, [purchasedPapers]);

  return (
    <div className="app-shell min-h-screen">
      <DashboardHeader role="student" name={user.name} onLogout={onLogout} onFeed={onFeed} onExamCatalog={onExamCatalog} />
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">
        <div className="dashboard-hero p-6 text-white">
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.26em] text-emerald-50">
                <Sparkles size={12} /> Tableau de bord
              </div>
              <h1 className="dashboard-title text-3xl leading-tight sm:text-4xl">Bienvenue, {user.name}</h1>
              <p className="mt-2 text-sm text-emerald-50/80 sm:text-base">
                Retrouvez vos documents déjà achetés, suivez votre progression et accédez rapidement à vos matières favorites.
              </p>
            </div>
            <button onClick={onViewProfile} className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/12 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white ring-1 ring-white/20 transition-all hover:bg-white/18">
              Voir mon profil <ArrowRight size={12} />
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { label: "Documents", value: summary.total.toString(), icon: Download },
            { label: "Matières", value: summary.subjects.toString(), icon: GraduationCap },
            { label: "Niveaux", value: summary.levels.toString(), icon: CheckCircle2 },
          ].map((item) => (
            <div key={item.label} className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                <item.icon size={18} />
              </div>
              <p className="text-2xl font-black text-slate-900">{item.value}</p>
              <p className="text-sm text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-1 rounded-2xl border border-white/80 bg-white/85 p-1 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          {([
            ["purchases", "Mes Achats", Download],
            ["cart", "Mon Panier", ShoppingCart],
            ["saved", "Mes Favoris", Heart],
          ] as const).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${tab === t ? "bg-emerald-800 text-white shadow-md" : "text-slate-500 hover:text-emerald-900"}`}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Icon size={14} /> {label}
              </span>
            </button>
          ))}
        </div>

        {tab === "purchases" && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Bibliothèque</p>
              <button onClick={onFeed} className="text-xs font-bold text-green-600 hover:text-green-700">Découvrir le catalogue</button>
            </div>
            {purchasedPapers.length === 0 ? (
              <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white/80 p-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.04)] backdrop-blur-xl">
                <BookOpen size={34} className="mx-auto mb-3 text-slate-200" />
                <p className="text-base font-bold text-slate-700">Aucun achat pour le moment</p>
                <p className="mt-2 text-sm text-slate-500">Choisissez un sujet dans le catalogue pour le télécharger.</p>
                <button onClick={onFeed} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700">
                  Parcourir les sujets <ArrowRight size={14} />
                </button>
              </div>
            ) : purchasedPapers.map((p) => (
              <div key={p.id} className="rounded-[1.75rem] border border-white/70 bg-white/85 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl text-xs font-black text-white shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${p.school.color || '#22c55e'}, rgba(15,23,42,0.16))` }}
                  >
                    {p.school.short}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-800">{p.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{p.level} · {p.subject}</p>
                  </div>
                  <button onClick={() => downloadPaper(p)} disabled={!p.fileUrl} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300">
                    <Download size={11} /> PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "cart" && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Panier d'achat</p>
              <button onClick={onFeed} className="text-xs font-bold text-green-600 hover:text-green-700">Ajouter des sujets</button>
            </div>
            {cartPapers.length === 0 ? (
              <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white/80 p-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.04)] backdrop-blur-xl">
                <ShoppingCart size={34} className="mx-auto mb-3 text-slate-200" />
                <p className="text-base font-bold text-slate-700">Votre panier est vide</p>
                <p className="mt-2 text-sm text-slate-500">Ajoutez des sujets depuis la page de publication.</p>
              </div>
            ) : (
              <div className="rounded-[1.75rem] border border-white/70 bg-white/85 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="space-y-3">
                  {cartPapers.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-800">{p.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{p.level} · {p.subject}</p>
                      </div>
                      <span className="text-sm font-black text-green-700">{p.price.toLocaleString("fr-FR")} F</span>
                      <button onClick={() => onRemoveFromCart(p.id)} className="rounded-full p-2 text-slate-300 hover:bg-red-50 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">Total <span className="text-xl font-black text-slate-900">{cartTotal.toLocaleString("fr-FR")} FCFA</span></p>
                  <button onClick={onCheckoutCart} className="rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white hover:bg-green-700">
                    Valider le panier
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "saved" && (
          <div className="mt-6 rounded-[1.75rem] border border-slate-100 bg-white/80 p-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.04)] backdrop-blur-xl">
            <Heart size={32} className="mx-auto mb-3 text-slate-200" />
            <p className="text-base font-bold text-slate-700">Aucun favori enregistré</p>
            <p className="mt-2 text-sm text-slate-500">Sauvegardez les documents qui vous intéressent pour les retrouver plus rapidement.</p>
          </div>
        )}
      </div>
    </div>
  );
}
