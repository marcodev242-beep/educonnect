import React, { useEffect, useState } from "react";
import { ChevronLeft, FileText, Clock, CheckCircle2, Star, GraduationCap, User, Plus, Edit3, Download } from "lucide-react";
import { DashboardHeader } from "../components/DashboardHeader";
import { apiUrl } from "../../lib/api";
import { toast } from "sonner";
import { CatalogClass, CatalogSubject } from "../types";

interface TeacherExamsPageProps {
  onLogout: () => void;
  onFeed: () => void;
  onTeacherSubjects?: () => void;
  onTeacherExams?: () => void;
  user: { id: string; name: string; role: string };
  classes: CatalogClass[];
  subjects: CatalogSubject[];
}

export function TeacherExamsPage({ onLogout, onFeed, onTeacherSubjects, onTeacherExams, user, classes, subjects }: TeacherExamsPageProps) {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"list" | "create">("list");
  const [createExam, setCreateExam] = useState({
    titre: "",
    description: "",
    prix: "",
    dureeHeures: "1",
    dureeMinutes: "0",
    dateDebut: "",
    heureDebut: "09:00",
    places: "",
    classId: "",
    subjectId: "",
  });
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [subjectFiles, setSubjectFiles] = useState<File[]>([]);
  const [editingExam, setEditingExam] = useState<any | null>(null);
  const [savingExam, setSavingExam] = useState(false);
  const [deletingExam, setDeletingExam] = useState<string | null>(null);
  const [copiesExam, setCopiesExam] = useState<any | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, { grade: string; appreciation: string }>>({});
  const [savingGrade, setSavingGrade] = useState<string | null>(null);
  const filteredSubjects = subjects;

  const fetchExams = async () => {
    try {
      const res = await fetch(apiUrl("/api/teacher/exams"), { credentials: "include" });
      if (!res.ok) throw new Error("Impossible de charger les examens");
      const data = await res.json();
      setExams(data.exams || []);
    } catch (error) {
      console.error("Erreur examens enseignant:", error);
      toast.error("Impossible de charger vos examens");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const handleCreateExam = async () => {
    if (!createExam.titre.trim() || !createExam.classId || !createExam.subjectId || !createExam.dateDebut) return toast.error("Le titre, le niveau, la matière et la date sont requis.");
    if (subjectFiles.length === 0) return toast.error("Ajoutez au moins un fichier au sujet de l’examen.");
    if (subjectFiles.length > 10) return toast.error("Vous pouvez joindre jusqu’à 10 fichiers.");
    setCreating(true);
    try {
      const startAt = new Date(`${createExam.dateDebut}T${createExam.heureDebut}`);
      const durationMinutes = Number(createExam.dureeHeures) * 60 + Number(createExam.dureeMinutes);
      if (!Number.isFinite(startAt.getTime()) || startAt.getTime() <= Date.now()) throw new Error("Choisissez une date de début dans le futur.");
      if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 300) throw new Error("La durée doit être comprise entre 15 et 300 minutes.");
      const form = new FormData();
      form.append("title", createExam.titre);
      form.append("description", createExam.description);
      form.append("price", String(Number(createExam.prix) || 0));
      form.append("durationMinutes", String(durationMinutes));
      form.append("startAt", startAt.toISOString());
      form.append("classId", createExam.classId);
      form.append("subjectId", createExam.subjectId);
      form.append("maxSeats", createExam.places);
      subjectFiles.forEach(file => form.append("subjects", file));
      const res = await fetch(apiUrl("/api/teacher/exams"), {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible de créer l'examen");
      toast.success("Examen créé avec succès");
      setCreateExam({ titre: "", description: "", prix: "", dureeHeures: "1", dureeMinutes: "0", dateDebut: "", heureDebut: "09:00", places: "", classId: "", subjectId: "" });
      setSubjectFiles([]);
      setActiveTab("list");
      await fetchExams();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de créer l'examen");
    } finally {
      setCreating(false);
    }
  };

  const launchExam = async (examId: string) => {
    setPublishing(examId);
    try {
      const res = await fetch(apiUrl(`/api/teacher/exams/${encodeURIComponent(examId)}/launch`), { method: "POST", credentials: "include" });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Publication impossible");
      toast.success("Examen lancé."); await fetchExams();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Publication impossible"); }
    finally { setPublishing(null); }
  };

  const openSubmissions = async (exam: any) => {
    setCopiesExam(exam);
    try {
      const res = await fetch(apiUrl(`/api/exams/${encodeURIComponent(exam.id_examen)}/submissions`), { credentials: "include" });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Impossible de charger les copies");
      setSubmissions(data.submissions || []);
      setGradeDrafts(Object.fromEntries((data.submissions || []).map((s: any) => [s.id_eleve, { grade: s.note == null ? "" : String(s.note), appreciation: s.appreciation || "" }])));
    } catch (error) { setCopiesExam(null); toast.error(error instanceof Error ? error.message : "Impossible de charger les copies"); }
  };

  const saveGrade = async (submission: any) => {
    const draft = gradeDrafts[submission.id_eleve]; setSavingGrade(submission.id_eleve);
    try {
      const form = new FormData(); form.append("grade", draft?.grade || ""); form.append("appreciation", draft?.appreciation || "");
      const res = await fetch(apiUrl(`/api/teacher/exams/${encodeURIComponent(copiesExam.id_examen)}/submissions/${encodeURIComponent(submission.id_eleve)}`), { method: "PATCH", credentials: "include", body: form });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Correction impossible");
      toast.success("Note enregistrée."); await openSubmissions(copiesExam); await fetchExams();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Correction impossible"); }
    finally { setSavingGrade(null); }
  };

  const beginEdit = (exam: any) => {
    const start = new Date(exam.date_debut);
    const local = new Date(start.getTime() - start.getTimezoneOffset() * 60_000).toISOString();
    setEditingExam({
      ...exam,
      classId: exam.id_classe,
      subjectId: exam.id_matiere,
      title: exam.titre,
      description: exam.description || "",
      price: String(exam.prix_inscription || 0),
      durationHours: String(Math.floor(Number(exam.duree_minutes) / 60)),
      durationMinutes: String(Number(exam.duree_minutes) % 60),
      startDate: local.slice(0, 10),
      startTime: local.slice(11, 16),
      maxSeats: exam.places_max ? String(exam.places_max) : "",
    });
  };

  const saveExamChanges = async () => {
    if (!editingExam) return;
    const startAt = new Date(`${editingExam.startDate}T${editingExam.startTime}`);
    const durationMinutes = Number(editingExam.durationHours) * 60 + Number(editingExam.durationMinutes);
    if (!Number.isFinite(startAt.getTime()) || startAt.getTime() <= Date.now()) return toast.error("La date de début doit être dans le futur.");
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 300) return toast.error("La durée doit être comprise entre 15 et 300 minutes.");
    setSavingExam(true);
    try {
      const res = await fetch(apiUrl(`/api/teacher/exams/${encodeURIComponent(editingExam.id_examen)}`), {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingExam.title, description: editingExam.description, price: Number(editingExam.price), durationMinutes, startAt: startAt.toISOString(), maxSeats: editingExam.maxSeats ? Number(editingExam.maxSeats) : null, classId: editingExam.classId, subjectId: editingExam.subjectId }),
      });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Modification impossible");
      toast.success("Examen modifié."); setEditingExam(null); await fetchExams();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Modification impossible"); }
    finally { setSavingExam(false); }
  };

  const deleteExam = async (exam: any) => {
    if (!window.confirm(`Supprimer l’examen « ${exam.titre} » ? Cette action est définitive.`)) return;
    setDeletingExam(exam.id_examen);
    try {
      const res = await fetch(apiUrl(`/api/teacher/exams/${encodeURIComponent(exam.id_examen)}`), { method: "DELETE", credentials: "include" });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Suppression impossible");
      toast.success("Examen supprimé."); await fetchExams();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Suppression impossible"); }
    finally { setDeletingExam(null); }
  };

  const statutLabels: Record<string, string> = {
    ANNOUNCE: "Annonce",
    EN_COURS: "En cours",
    TERMINE: "Terminé",
    ANNULE: "Annulé",
  };

  return (
    <div className="app-shell min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">
        <DashboardHeader role="teacher" name={user.name} onLogout={onLogout} onFeed={onFeed} onTeacherSubjects={onTeacherSubjects} onTeacherExams={onTeacherExams} />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Mes examens</h1>
            <p className="text-slate-600">Créez, publiez et corrigez vos examens test en ligne</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("list")}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === "list"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              Liste
            </button>
            <button
              onClick={() => setActiveTab("create")}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === "create"
                  ? "bg-green-600 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Plus size={14} /> Créer
            </button>
          </div>
        </div>

        {activeTab === "list" ? (
          <div className="space-y-6">
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
                Chargement de vos examens… Vous pouvez déjà consulter cette page.
              </div>
            ) : exams.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 p-16 text-center">
                <Plus className="mx-auto mb-3 text-slate-200" size={32} />
                <p className="text-sm font-bold text-slate-700">Aucun examen créé</p>
                <p className="mt-2 text-xs text-slate-500">Cliquez sur "Créer" pour publier un nouvel examen.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {exams.map((exam) => (
                  <div
                    key={exam.id_examen}
                    className="rounded-2xl border border-white/70 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-[0.12em] ${
                            (exam.statut_effectif || exam.statut) === "EN_COURS" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                            (exam.statut_effectif || exam.statut) === "ANNOUNCE" ? "bg-amber-50 text-amber-700 border-amber-100" :
                            "bg-slate-50 text-slate-700 border-slate-100"
                          }`}>
                            {statutLabels[exam.statut_effectif || exam.statut] || exam.statut_effectif || exam.statut}
                          </span>
                        </div>
                        <h3 className="text-lg font-black text-slate-900">{exam.titre}</h3>
                        <p className="text-sm text-slate-500">
                          {exam.nom_matiere} · Niveau {exam.nom_classe} · {exam.duree_minutes} min
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{Array.isArray(exam.fichiers_sujets) && exam.fichiers_sujets.length ? `${exam.fichiers_sujets.length} fichier(s) dans le sujet` : exam.url_sujet && exam.url_sujet !== "#" ? "1 fichier dans le sujet" : "Sujet non ajouté"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-xs text-slate-400 uppercase font-bold">Inscrits</p>
                        <p className="text-sm font-black">{exam.inscrits || 0}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-xs text-slate-400 uppercase font-bold">Copies reçues</p>
                        <p className="text-sm font-black">{exam.copies_recues || 0}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-xs text-slate-400 uppercase font-bold">À corriger</p>
                        <p className="text-sm font-black text-orange-600">{exam.copies_a_corriger || 0}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {(exam.statut_effectif || exam.statut) === "ANNOUNCE" && <>
                        <button onClick={() => beginEdit(exam)} className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-800 hover:bg-amber-100">Modifier</button>
                        <button onClick={() => deleteExam(exam)} disabled={deletingExam === exam.id_examen} className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-50">{deletingExam === exam.id_examen ? "Suppression…" : "Supprimer"}</button>
                      </>}
                      {(exam.statut_effectif || exam.statut) === "ANNOUNCE" && (
                        <button
                          onClick={() => launchExam(exam.id_examen)} disabled={publishing === exam.id_examen || new Date(exam.date_debut).getTime() > Date.now() || !exam.url_sujet || exam.url_sujet === "#"}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {publishing === exam.id_examen ? "Lancement…" : new Date(exam.date_debut).getTime() > Date.now() ? `Début prévu le ${new Date(exam.date_debut).toLocaleString("fr-FR")}` : "Lancer l’examen"}
                        </button>
                      )}
                      {((exam.statut_effectif || exam.statut) === "EN_COURS" || (exam.statut_effectif || exam.statut) === "TERMINE") && (
                        <button
                          onClick={() => openSubmissions(exam)}
                          className="flex-1 py-2.5 rounded-xl bg-slate-100 text-xs font-black text-slate-700 hover:bg-slate-200 transition-colors"
                        >
                          Voir et corriger les copies
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/70 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <h2 className="text-lg font-black text-slate-900 mb-6">Créer un nouvel examen</h2>
            <p className="text-sm text-slate-500 mb-6">
              Choisissez le niveau et la matière, ajoutez le sujet, puis définissez la date, l’heure et la durée.
            </p>
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); void handleCreateExam(); }}>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-semibold text-slate-500 block mb-2">Niveau</label><select required value={createExam.classId} onChange={e => setCreateExam({ ...createExam, classId: e.target.value, subjectId: "" })} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"><option value="">Choisir un niveau</option>{classes.map(c => <option key={c.id_classe} value={c.id_classe}>{c.nom_classe}</option>)}</select></div>
                <div><label className="text-xs font-semibold text-slate-500 block mb-2">Matière</label><select required value={createExam.subjectId} onChange={e => setCreateExam({ ...createExam, subjectId: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"><option value="">Choisir une matière</option>{filteredSubjects.map(s => <option key={s.id_matiere} value={s.id_matiere}>{s.nom_matiere}</option>)}</select></div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-2">Titre de l'examen</label>
                <input
                  type="text"
                  required
                  value={createExam.titre}
                  onChange={e => setCreateExam({ ...createExam, titre: e.target.value })}
                  placeholder="Ex: Examen blanc de mathématiques - 1ère"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-2">Description</label>
                <textarea
                  rows={3}
                  value={createExam.description}
                  onChange={e => setCreateExam({ ...createExam, description: e.target.value })}
                  placeholder="Objectifs, chapitres évalués, consignes…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-2">Prix d'inscription (FCFA)</label>
                  <input
                    type="number"
                    value={createExam.prix}
                    onChange={e => setCreateExam({ ...createExam, prix: e.target.value })}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500"
                  />
                </div>
                <div><label className="text-xs font-semibold text-slate-500 block mb-2">Durée de l’examen</label><div className="flex gap-2"><select aria-label="Heures de durée" value={createExam.dureeHeures} onChange={e => setCreateExam({ ...createExam, dureeHeures: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">{Array.from({ length: 6 }, (_, hour) => <option key={hour} value={hour}>{hour} h</option>)}</select><select aria-label="Minutes de durée" value={createExam.dureeMinutes} onChange={e => setCreateExam({ ...createExam, dureeMinutes: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">{[0, 15, 30, 45].map(minute => <option key={minute} value={minute}>{String(minute).padStart(2, "0")} min</option>)}</select></div></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-2">Date de début</label>
                  <input
                    type="date"
                    required
                    value={createExam.dateDebut}
                    onChange={e => setCreateExam({ ...createExam, dateDebut: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500"
                  />
                </div>
                <div><label className="text-xs font-semibold text-slate-500 block mb-2">Heure de début</label><input type="time" step="60" required value={createExam.heureDebut} onChange={e => setCreateExam({ ...createExam, heureDebut: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500" /></div>
              </div>
              <div><label className="text-xs font-semibold text-slate-500 block mb-2">Pages du sujet (PDF ou images, 10 Mo maximum par fichier, jusqu’à 10 fichiers)</label><input type="file" required multiple accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={e => { const files = Array.from(e.target.files || []); if (files.length > 10) { toast.error("Vous pouvez joindre jusqu’à 10 fichiers."); e.target.value = ""; setSubjectFiles([]); return; } setSubjectFiles(files); }} className="block w-full rounded-xl border border-slate-200 p-3 text-sm" />{subjectFiles.length > 0 && <ul className="mt-2 list-inside list-disc text-xs text-slate-600">{subjectFiles.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}</li>)}</ul>}</div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-2">Places maximum (optionnel)</label>
                <input
                  type="number"
                  value={createExam.places}
                  onChange={e => setCreateExam({ ...createExam, places: e.target.value })}
                  placeholder="Illimité"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full py-3 rounded-xl bg-green-600 text-xs font-black text-white uppercase tracking-wider hover:bg-green-700 transition-colors"
              >
                {creating ? "Création…" : "Créer l'examen"}
              </button>
            </form>
          </div>
        )}
      </div>
      {editingExam && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4" onClick={() => setEditingExam(null)}><div className="mx-auto mt-8 max-w-xl rounded-2xl bg-white p-6" onClick={event => event.stopPropagation()}><h2 className="mb-5 text-xl font-black">Modifier l’examen</h2><div className="space-y-3"><label className="block text-xs font-bold">Titre<input value={editingExam.title} onChange={e => setEditingExam({ ...editingExam, title: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="block text-xs font-bold">Description<textarea value={editingExam.description} onChange={e => setEditingExam({ ...editingExam, description: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Prix (FCFA)<input type="number" min="0" value={editingExam.price} onChange={e => setEditingExam({ ...editingExam, price: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="text-xs font-bold">Places max<input type="number" min="1" value={editingExam.maxSeats} onChange={e => setEditingExam({ ...editingExam, maxSeats: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label></div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Date<input type="date" value={editingExam.startDate} onChange={e => setEditingExam({ ...editingExam, startDate: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="text-xs font-bold">Heure<input type="time" value={editingExam.startTime} onChange={e => setEditingExam({ ...editingExam, startTime: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label></div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Durée (heures)<input type="number" min="0" max="5" value={editingExam.durationHours} onChange={e => setEditingExam({ ...editingExam, durationHours: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="text-xs font-bold">Durée (minutes)<input type="number" min="0" max="59" value={editingExam.durationMinutes} onChange={e => setEditingExam({ ...editingExam, durationMinutes: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label></div><div className="flex justify-end gap-2 pt-2"><button onClick={() => setEditingExam(null)} className="rounded-lg border px-4 py-2 text-sm">Annuler</button><button disabled={savingExam} onClick={saveExamChanges} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{savingExam ? "Enregistrement…" : "Enregistrer"}</button></div></div></div></div>}
      {copiesExam && <div className="fixed inset-0 z-50 bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setCopiesExam(null)}><div className="mx-auto mt-10 max-w-3xl rounded-2xl bg-white p-6" onClick={e => e.stopPropagation()}><div className="flex justify-between"><h2 className="text-xl font-black">Copies : {copiesExam.titre}</h2><button onClick={() => setCopiesExam(null)}>Fermer</button></div>{submissions.length === 0 ? <p className="py-8 text-center text-slate-500">Aucune copie reçue pour le moment.</p> : <div className="mt-5 space-y-4">{submissions.map(s => <div key={s.id_copie} className="rounded-xl border p-4"><p className="font-bold">{s.prenom} {s.nom}</p><a className="text-sm text-blue-700 underline" href={apiUrl(`/api/exams/${encodeURIComponent(copiesExam.id_examen)}/submissions/${encodeURIComponent(s.id_copie)}/file`)} target="_blank" rel="noreferrer">{s.nom_fichier || "Ouvrir la copie"}</a><div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2"><input type="number" min="0" max="20" step="0.25" placeholder="Note /20" value={gradeDrafts[s.id_eleve]?.grade || ""} onChange={e => setGradeDrafts(v => ({ ...v, [s.id_eleve]: { ...v[s.id_eleve], grade: e.target.value } }))} className="rounded-lg border p-2"/><input placeholder="Appréciation" value={gradeDrafts[s.id_eleve]?.appreciation || ""} onChange={e => setGradeDrafts(v => ({ ...v, [s.id_eleve]: { ...v[s.id_eleve], appreciation: e.target.value } }))} className="rounded-lg border p-2"/><button disabled={savingGrade === s.id_eleve || !gradeDrafts[s.id_eleve]?.grade} onClick={() => saveGrade(s)} className="rounded-lg bg-green-600 p-2 font-bold text-white">{savingGrade === s.id_eleve ? "Enregistrement…" : "Enregistrer la note"}</button></div></div>)}</div>}</div></div>}
    </div>
  );
}
