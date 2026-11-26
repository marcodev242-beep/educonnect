import React, { useCallback, useEffect, useState } from "react";
import { Camera, ChevronLeft, FileText, Upload } from "lucide-react";
import { DashboardHeader } from "../components/DashboardHeader";
import { ExamCountdown } from "../components/ExamCountdown";
import { apiUrl } from "../../lib/api";
import { toast } from "sonner";

export function StudentExamSessionPage({ examId, user, onLogout, onBack }: { examId: string; user: { id: string; name: string; role: string }; onLogout: () => void; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [copies, setCopies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(apiUrl(`/api/exams/${encodeURIComponent(examId)}`), { credentials: "include", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Impossible de charger la session");
      setData(body);
      const copiesResponse = await fetch(apiUrl(`/api/exams/${encodeURIComponent(examId)}/submissions`), { credentials: "include", cache: "no-store" });
      if (copiesResponse.ok) {
        const copiesBody = await copiesResponse.json();
        setCopies(copiesBody.submissions || []);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erreur de chargement"); }
    finally { setLoading(false); }
  }, [examId]);
  useEffect(() => { void load(); const id = window.setInterval(() => void load(), 15000); return () => window.clearInterval(id); }, [load]);

  const uploadCopies = (files: FileList | null) => {
    if (!files?.length) return;
    const form = new FormData();
    Array.from(files).forEach(file => form.append("files", file));
    setUploading(true);
    void fetch(apiUrl(`/api/exams/${encodeURIComponent(examId)}/submissions`), { method: "POST", credentials: "include", body: form })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Dépôt impossible"); toast.success("Copies déposées avec succès"); await load(); })
      .catch(error => toast.error(error instanceof Error ? error.message : "Erreur de dépôt"))
      .finally(() => setUploading(false));
  };
  const exam = data?.exam;
  const paid = ["PAYE", "GRATUIT_ABONNEMENT"].includes(data?.enrollment?.statut);
  const open = exam?.statut === "EN_COURS" && new Date(exam.date_fin).getTime() > Date.now();
  if (loading) return <div className="app-shell min-h-screen grid place-items-center text-slate-500">Chargement de la session…</div>;
  if (!exam) return <div className="app-shell min-h-screen grid place-items-center">Session introuvable.</div>;

  return <div className="app-shell min-h-screen"><main className="mx-auto max-w-5xl px-4 py-6"><DashboardHeader role="student" name={user.name} onLogout={onLogout} onFeed={onBack} />
    <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600"><ChevronLeft size={16}/> Retour à mes examens</button>
    <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-xl md:p-9">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><p className="text-xs font-black uppercase tracking-widest text-emerald-700">Session d’examen</p><h1 className="mt-2 text-3xl font-black text-slate-900">{exam.titre}</h1><p className="mt-2 text-slate-600">{exam.nom_matiere || "Matière"} · Niveau {exam.nom_classe || "—"}</p></div><ExamCountdown endsAt={exam.date_fin}/></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><small className="text-slate-500">Début</small><p className="font-bold">{new Date(exam.date_debut).toLocaleString("fr-FR")}</p></div><div className="rounded-xl bg-slate-50 p-4"><small className="text-slate-500">Fin prévue</small><p className="font-bold">{new Date(exam.date_fin).toLocaleString("fr-FR")}</p></div><div className="rounded-xl bg-slate-50 p-4"><small className="text-slate-500">Copies déposées</small><p className="font-bold">{data?.submissionCount ?? 0}</p></div></div>
      {paid && open ? <div className="mt-7 rounded-2xl bg-emerald-50 p-5"><h2 className="font-black text-emerald-950">Sujet de l’épreuve</h2><div className="mt-3 flex flex-wrap gap-2">{(Array.isArray(exam.fichiers_sujets) ? exam.fichiers_sujets : []).map((file: any, index: number) => <a key={index} href={apiUrl(`/api/exams/${encodeURIComponent(examId)}/subjects/${index}`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-emerald-800"><FileText size={16}/>{file.name || `Sujet ${index + 1}`}</a>)}{!exam.fichiers_sujets?.length && exam.url_sujet && <a href={apiUrl(`/api/exams/${encodeURIComponent(examId)}/subjects/0`)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-emerald-800"><FileText size={16}/>Télécharger le sujet</a>}</div>
        <div className="mt-5 flex flex-wrap gap-3"><label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white ${uploading ? "opacity-50" : ""}`}><Upload size={17}/>{uploading ? "Envoi…" : "Téléverser mes copies"}<input type="file" multiple accept=".pdf,image/*,.doc,.docx" className="hidden" disabled={uploading} onChange={event => { uploadCopies(event.target.files); event.currentTarget.value = ""; }}/></label><label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white ${uploading ? "opacity-50" : ""}`}><Camera size={17}/>Prendre une photo<input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading} onChange={event => { uploadCopies(event.target.files); event.currentTarget.value = ""; }}/></label></div><p className="mt-3 text-xs text-emerald-900">Vous pouvez déposer une copie maintenant, puis ajouter d’autres pages avant la fin de l’épreuve.</p>
      </div> : !paid ? <p className="mt-7 rounded-xl bg-amber-50 p-4 font-semibold text-amber-900">Votre inscription doit être confirmée avant d’accéder au sujet et au dépôt des copies.</p> : <p className="mt-7 rounded-xl bg-slate-100 p-4 font-semibold text-slate-700">La session est terminée. Le dépôt des copies est fermé.</p>}
      {copies.length > 0 && <section className="mt-6 rounded-2xl border border-slate-200 p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">Mes copies envoyées</h2><p className="mt-1 text-xs text-slate-500">Toutes vos pages et tous vos envois pour cet examen sont réunis ici.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{copies.length}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{copies.map((copy: any, index: number) => { const fileUrl = apiUrl(`/api/exams/${encodeURIComponent(examId)}/submissions/${encodeURIComponent(copy.id_copie)}/file`); return <div key={copy.id_copie} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><p className="truncate px-3 py-2 text-xs font-bold text-slate-700">Copie {index + 1} · {copy.nom_fichier || "Fichier envoyé"}</p>{String(copy.type_fichier || "").startsWith("image/") ? <a href={fileUrl} target="_blank" rel="noreferrer"><img crossOrigin="use-credentials" src={fileUrl} alt={`Ma copie ${index + 1}`} className="max-h-80 w-full bg-white object-contain" /></a> : <a className="block px-3 pb-3 text-sm font-bold text-blue-700 underline" href={fileUrl} target="_blank" rel="noreferrer">Ouvrir cette copie</a>}</div>; })}</div></section>}
    </section></main></div>;
}
