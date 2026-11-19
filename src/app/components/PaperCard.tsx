import React, { useState } from "react";
import { Award, Download, Info, LockKeyhole, ShoppingBag, X } from "lucide-react";
import { Paper } from "../types";

export function PaperCard({
  paper,
  onBuy,
  isPurchased,
  compact = true,
  isPremium = false,
}: {
  paper: Paper;
  onBuy: (paper: Paper) => void;
  isPurchased: boolean;
  isSaved?: boolean;
  onSave?: (id: string) => void;
  compact?: boolean;
  isPremium?: boolean;
}) {
  const downloadsLabel = paper.downloads.toLocaleString("fr-FR");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const descriptionPreview = paper.description && paper.description.length > 200
    ? `${paper.description.slice(0, 200)}...`
    : paper.description;

  const handleDocumentAction = (mode: "download" | "print") => {
    if (!paper.fileUrl) return;

    const link = document.createElement("a");
    link.href = paper.fileUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (mode === "download") {
      const fileName = `${(paper.title || "document").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.pdf`;
      link.setAttribute("download", fileName);
    }

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (mode === "print") {
      const win = window.open(paper.fileUrl, "_blank", "noopener,noreferrer");
      if (win) {
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } catch (error) {
            console.error("Impossible d'imprimer le document", error);
          }
        }, 700);
      }
    }
  };

  const descriptionDialog = descriptionOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm md:p-6" onClick={() => setDescriptionOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={`Détails du sujet ${paper.title}`} className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5 md:p-7">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-green-600">Détails du sujet</p>
            <h2 className="mt-2 text-2xl font-black leading-tight text-slate-900 md:text-3xl">{paper.title}</h2>
          </div>
          <button type="button" aria-label="Fermer" onClick={() => setDescriptionOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-5 md:p-7">
          <div className="grid gap-3 sm:grid-cols-2">
            {[["Enseignant", paper.teacher.name], ["Niveau", paper.level], ["Matière", paper.subject], ["Année", paper.year], ["Période", paper.period || "Non précisée"], ["Type", paper.type || "Sujet"], ["Établissement", paper.school.name], ["Prix", `${paper.price.toLocaleString("fr-FR")} FCFA`], ["Achats", downloadsLabel]].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
          {paper.teacher.bio && <div className="mt-4 rounded-2xl border border-green-100 bg-green-50/50 p-4"><p className="text-xs font-black text-green-800">À propos de l’enseignant</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{paper.teacher.bio}</p></div>}
          <div className="mt-4 rounded-2xl border border-slate-100 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{paper.description || "Aucune description renseignée par l’enseignant."}</p>
          </div>
          {paper.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{paper.tags.map(tag => <span key={tag} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">{tag}</span>)}</div>}
        </div>
        <div className="flex items-center gap-3 border-t border-slate-100 bg-white p-4 md:px-7">
          <span className="text-lg font-black text-green-700">{paper.price.toLocaleString("fr-FR")} FCFA</span>
          {isPurchased ? <button type="button" onClick={() => handleDocumentAction("download")} className="primary-button ml-auto px-6 py-3 text-sm font-black"><Download size={16} /> Télécharger</button> : <button type="button" onClick={() => { onBuy(paper); setDescriptionOpen(false); }} className="primary-button ml-auto px-6 py-3 text-sm font-black"><ShoppingBag size={16} /> Acheter · Ajouter au panier</button>}
        </div>
      </div>
    </div>
  );

  if (!compact) {
    return (
      <>
      <article className="paper-card group cursor-pointer" onClick={() => setDescriptionOpen(true)}>
        <div className="flex items-start gap-3 p-4 md:p-5">
          <button
            type="button"
            onClick={event => { event.stopPropagation(); setDescriptionOpen(true); }}
            className="relative w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-black flex-shrink-0 overflow-hidden border border-white shadow-md hover:scale-105 transition-transform"
            style={{ backgroundColor: paper.school.color }}
            title={`Voir les détails du sujet de ${paper.teacher.name}`}
          >
            {paper.teacher.avatar ? (
              <img src={paper.teacher.avatar} alt={paper.teacher.name} className="w-full h-full object-cover" />
            ) : (
              paper.teacher.initials
            )}
          </button>
          <div className="min-w-0 flex-1">
            {isPremium && (
              <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
                <Award size={11} /> Premium
              </span>
            )}
            <h3 className="text-lg font-black text-slate-950 leading-tight">{paper.title}</h3>
              {descriptionPreview ? (
                <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-slate-600">{descriptionPreview}</p>
            ) : null}
          </div>
        </div>
        <div className="px-4 md:px-5 pb-4 md:pb-5 flex items-center gap-3 border-t border-slate-100 pt-4">
          <span className="text-xl font-black text-green-700">{paper.price.toLocaleString("fr-FR")} FCFA</span>
          {isPurchased ? (
            <button type="button" onClick={event => { event.stopPropagation(); handleDocumentAction("download"); }} className="primary-button ml-auto text-sm font-black px-4 py-2">
              <Download size={14} /> Telecharger
            </button>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={event => { event.stopPropagation(); setDescriptionOpen(true); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-600 hover:border-green-400 hover:text-green-700">
                <Info size={14} />
              </button>
              <button onClick={event => { event.stopPropagation(); onBuy(paper); }} className="primary-button text-sm font-black px-4 py-2">
                <ShoppingBag size={14} /> Ajouter au panier
              </button>
            </div>
          )}
        </div>
      </article>
      {descriptionDialog}
      </>
    );
  }

  return (
    <>
    <article className="paper-card-compact group flex flex-col h-full cursor-pointer" onClick={() => setDescriptionOpen(true)}>
      {/* Mini apercu verrouille */}
      <div className="document-preview-compact relative flex-shrink-0">
        <div className="absolute inset-0 p-2 select-none pointer-events-none">
          <div className="h-1.5 w-2/3 rounded-full bg-slate-300 mb-1.5" />
          <div className="space-y-1">
            <div className="h-1 rounded-full bg-slate-200" />
            <div className="h-1 w-4/5 rounded-full bg-slate-200" />
            <div className="h-1 w-3/5 rounded-full bg-slate-200" />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/90" />
        {!isPurchased && (
          <div className="absolute inset-0 flex items-center justify-center">
            <LockKeyhole size={14} className="text-slate-400" />
          </div>
        )}
        <span
          className="absolute top-1.5 left-1.5 text-[8px] font-black px-1 py-0.5 rounded text-white"
          style={{ backgroundColor: paper.school.color }}
        >
          {paper.school.short}
        </span>
        {isPremium && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-amber-400 px-1 py-0.5 text-[8px] font-black text-slate-950">
            <Award size={8} /> Premium
          </span>
        )}
      </div>

      {/* Contenu */}
      <div className="flex flex-col flex-1 p-2.5 gap-1.5 min-h-0">
        <h3 className="text-[11px] font-black text-slate-900 leading-tight line-clamp-2" title={paper.title}>
          {paper.title}
        </h3>

        <div className="flex flex-wrap gap-1">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 truncate max-w-full">
            {paper.level}
          </span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 truncate max-w-full">
            {paper.subject}
          </span>
        </div>

        {paper.description ? (
          <p className="break-words whitespace-pre-wrap text-[9px] text-slate-500 leading-snug line-clamp-2" title={paper.description}>
            {descriptionPreview}
          </p>
        ) : null}

        <p className="text-[9px] text-slate-400 font-semibold truncate" title={paper.teacher.name}>{paper.teacher.name}</p>

        <div className="mt-auto pt-1.5 flex items-center justify-between gap-1 border-t border-slate-100">
          <div>
            <p className="text-sm font-black text-green-700 leading-none">
              {paper.price.toLocaleString("fr-FR")}
              <span className="text-[8px] text-slate-400 ml-0.5">FCFA</span>
            </p>
            <p className="text-[8px] text-slate-400 font-bold mt-0.5">{downloadsLabel} achats</p>
          </div>

          {isPurchased ? (
            <button
              type="button"
              onClick={event => { event.stopPropagation(); handleDocumentAction("download"); }}
              title="Telecharger"
              className="flex-shrink-0 p-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              <Download size={13} />
            </button>
          ) : (
            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={event => { event.stopPropagation(); setDescriptionOpen(true); }}
                title="Voir la description"
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-green-400 hover:text-green-700 transition-colors"
              >
                <Info size={13} />
              </button>
              <button
                onClick={event => { event.stopPropagation(); onBuy(paper); }}
                title="Ajouter au panier"
                className="p-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                <ShoppingBag size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
    {descriptionDialog}
    </>
  );
}
