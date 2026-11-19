import React, { useEffect, useState } from "react";
import { ChevronLeft, CalendarDays, Radio, ClipboardList } from "lucide-react";
import { DashboardHeader } from "../components/DashboardHeader";
import { ExamPaymentModal } from "../components/ExamPaymentModal";
import { ExamCountdown } from "../components/ExamCountdown";
import { apiUrl } from "../../lib/api";
import { toast } from "sonner";

interface StudentExamsPageProps {
  onLogout: () => void;
  onFeed: () => void;
  onExamCatalog?: () => void;
  initialTab?: "announced" | "live" | "registered";
  onSelectExam?: (exam: any) => void;
  onOpenSession?: (exam: any) => void;
  user: { id: string; name: string; role: string };
}

export function StudentExamsPage({ onLogout, onFeed, onExamCatalog, initialTab = "registered", onSelectExam, onOpenSession, user }: StudentExamsPageProps) {
  const [exams, setExams] = useState<any[]>([]);
  const [announcedExams, setAnnouncedExams] = useState<any[]>([]);
  const [liveExams, setLiveExams] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"announced" | "live" | "registered">(initialTab);
  const [loading, setLoading] = useState(true);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentExamId, setPaymentExamId] = useState("");

  const fetchExams = async () => {
    try {
      const [registeredRes, announcedRes, liveRes] = await Promise.all([
        fetch(apiUrl("/api/student/exams"), { credentials: "include" }),
        fetch(apiUrl("/api/exams?status=ANNOUNCE"), { credentials: "include" }),
        fetch(apiUrl("/api/exams?status=EN_COURS"), { credentials: "include" }),
      ]);
      if (!registeredRes.ok || !announcedRes.ok || !liveRes.ok) throw new Error("Impossible de charger les examens");
      const [registered, announced, live] = await Promise.all([registeredRes.json(), announcedRes.json(), liveRes.json()]);
      setExams(registered.exams || []);
      setAnnouncedExams(announced.exams || []);
      setLiveExams(live.exams || []);
    } catch (error) {
      console.error("Erreur examens élève:", error);
      toast.error("Impossible de charger vos examens");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchExams();
    const timer = window.setInterval(() => void fetchExams(), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const handlePay = (examId: string, amount: number) => {
    setPaymentExamId(examId);
    setPaymentAmount(amount);
    setPaymentModalOpen(true);
  };

  const statutLabels: Record<string, string> = {
    EN_ATTENTE_PAIEMENT: "En attente de paiement",
    PAYE: "Payé",
    GRATUIT_ABONNEMENT: "Gratuit (abonnement)",
    ANNULE: "Annulé",
  };

  if (loading) {
    return (
      <div className="app-shell min-h-screen flex items-center justify-center text-slate-500">
        Chargement de vos examens…
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">
        <DashboardHeader role="student" name={user.name} onLogout={onLogout} onFeed={onFeed} onExamCatalog={onExamCatalog} />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Examens en ligne</h1>
            <p className="text-slate-600">Retrouvez les annonces, les sessions ouvertes et vos inscriptions au même endroit.</p>
          </div>
          <button
            onClick={onFeed}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft size={14} /> Retour accueil
          </button>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <button onClick={() => setActiveTab("announced")} className={`flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-black sm:text-sm ${activeTab === "announced" ? "bg-emerald-700 text-white shadow" : "text-slate-600 hover:bg-slate-50"}`}><CalendarDays size={16} /><span>Annoncés</span><span className="rounded-full bg-white/20 px-2">{announcedExams.length}</span></button>
          <button onClick={() => setActiveTab("live")} className={`flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-black sm:text-sm ${activeTab === "live" ? "bg-emerald-700 text-white shadow" : "text-slate-600 hover:bg-slate-50"}`}><Radio size={16} /><span>En cours</span><span className="rounded-full bg-white/20 px-2">{liveExams.length}</span></button>
          <button onClick={() => setActiveTab("registered")} className={`flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-black sm:text-sm ${activeTab === "registered" ? "bg-emerald-700 text-white shadow" : "text-slate-600 hover:bg-slate-50"}`}><ClipboardList size={16} /><span>Mes examens</span><span className="rounded-full bg-white/20 px-2">{exams.length}</span></button>
        </div>

        {activeTab === "announced" || activeTab === "live" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(activeTab === "announced" ? announcedExams : liveExams).length === 0 ? <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white/80 p-12 text-center"><p className="font-bold text-slate-700">{activeTab === "announced" ? "Aucun examen annoncé pour le moment" : "Aucune session en cours"}</p><p className="mt-2 text-sm text-slate-500">Cette liste se met à jour automatiquement.</p></div> : (activeTab === "announced" ? announcedExams : liveExams).map(exam => {
              const registered = exams.some(item => item.id_examen === exam.id_examen);
              return <article key={exam.id_examen} className="rounded-2xl border border-white bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.07)]"><div className="mb-3 flex items-center justify-between"><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${activeTab === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{activeTab === "live" ? "Session ouverte" : "Examen annoncé"}</span>{registered && <span className="text-[10px] font-bold text-emerald-700">Inscrit</span>}</div><h2 className="text-lg font-black text-slate-900">{exam.titre}</h2><p className="mt-1 text-sm text-slate-500">{exam.nom_matiere || "Matière"} · Niveau {exam.nom_classe || "—"}</p><div className="mt-4 space-y-1 text-xs text-slate-600"><p>Début : {new Date(exam.date_debut).toLocaleString("fr-FR")}</p><p>Durée : {exam.duree_minutes} minutes · {Number(exam.prix_inscription || 0).toLocaleString("fr-FR")} FCFA</p></div>{activeTab === "live" && <div className="mt-4"><ExamCountdown endsAt={exam.date_fin}/></div>}<button onClick={() => activeTab === "live" && registered ? onOpenSession?.(exam) : onSelectExam?.(exam)} className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 text-xs font-black text-white hover:bg-emerald-700">{activeTab === "live" && registered ? "Ouvrir ma session" : activeTab === "live" ? "Voir les informations" : registered ? "Voir mon inscription" : "Consulter et s’inscrire"}</button></article>;
            })}
          </div>
        ) : exams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 p-16 text-center">
            <p className="text-sm font-bold text-slate-700">Aucun examen inscrit</p>
            <p className="mt-2 text-xs text-slate-500">Allez dans le catalogue pour vous inscrire à un examen.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {exams.map((exam) => {
              const statut = exam.statut_inscription || "EN_ATTENTE_PAIEMENT";
              const effectiveStatus = exam.statut_effectif || exam.statut;
              const prix = Number(exam.prix_inscription || 0);
              const isPaid = ["PAYE", "GRATUIT_ABONNEMENT"].includes(statut);
              const hasNote = exam.valeur != null;
              const hasCopy = Number(exam.copies_deposees || 0) > 0;

              return (
                <div
                  key={exam.id_examen}
                  className="rounded-2xl border border-white/70 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-[0.12em] ${
                          effectiveStatus === "EN_COURS" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                          effectiveStatus === "ANNOUNCE" ? "bg-amber-50 text-amber-700 border-amber-100" :
                          "bg-slate-50 text-slate-700 border-slate-100"
                        }`}>
                          {effectiveStatus === "EN_COURS" ? "En cours" : effectiveStatus === "ANNOUNCE" ? "À venir" : effectiveStatus === "TERMINE" ? "Terminé" : effectiveStatus}
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-slate-900">{exam.titre}</h3>
                      <p className="text-sm text-slate-500">
                        {exam.nom_matiere} · {exam.nom_classe} · {exam.duree_minutes} min
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-[0.12em] ${
                          statut === "PAYE" || statut === "GRATUIT_ABONNEMENT"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : statut === "EN_ATTENTE_PAIEMENT"
                              ? "bg-amber-50 text-amber-700 border-amber-100"
                              : "bg-slate-50 text-slate-700 border-slate-100"
                        }`}
                      >
                        {statutLabels[statut] || statut}
                      </span>
                      {hasNote && (
                        <span className="text-xs font-bold text-slate-600">
                          Note : <span className="text-green-600">{exam.valeur}/20</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs text-slate-400 uppercase font-bold">Prix inscription</p>
                      <p className="text-sm font-black">{prix.toLocaleString("fr-FR")} FCFA</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs text-slate-400 uppercase font-bold">Copies déposées</p>
                      <p className="text-sm font-black">{exam.copies_deposees || 0}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs text-slate-400 uppercase font-bold">Évaluation enseignant</p>
                      <p className="text-sm font-black">{exam.note_enseignant ?? "—"}/5</p>
                    </div>
                  </div>

                  {effectiveStatus === "EN_COURS" && isPaid && <div className="mb-5 flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-emerald-900">Votre session est ouverte</p><p className="text-xs text-emerald-800">Ouvrez la page de session pour consulter le sujet et déposer vos copies.</p></div><ExamCountdown endsAt={exam.date_fin}/><button onClick={() => onOpenSession?.(exam)} className="rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white hover:bg-emerald-800">Ouvrir la session</button></div>}

                  {!isPaid && prix > 0 ? (
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 mb-4">
                      <p className="text-sm font-bold text-amber-800 mb-2">Paiement requis</p>
                      <p className="text-xs text-amber-700 mb-3">
                        Vous devez payer {prix.toLocaleString("fr-FR")} FCFA pour confirmer votre inscription.
                      </p>
                      <button
                        onClick={() => handlePay(exam.id_examen, prix)}
                        className="w-full py-2.5 rounded-lg bg-amber-600 text-xs font-black text-white hover:bg-amber-700 transition-colors"
                      >
                        Payer l'inscription
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {hasCopy && !hasNote && (
                        <span className="flex-1 md:flex-auto py-3 rounded-xl bg-slate-200 text-xs font-black text-slate-500 uppercase tracking-wider">
                          Copie déposée, en attente de correction
                        </span>
                      )}
                      {hasNote && (
                        <div className="flex-1 md:flex-auto p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                          <p className="text-xs font-bold text-emerald-700 uppercase mb-1">Résultat</p>
                          <p className="text-lg font-black text-emerald-800">
                            {exam.valeur}/20
                            {exam.appreciation ? ` - ${exam.appreciation}` : ""}
                          </p>
                          {exam.url_corrige && (
                            <a
                              href={exam.url_corrige}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline"
                            >
                              Voir le corrigé
                            </a>
                          )}
                        </div>
                      )}
                      {effectiveStatus === "EN_COURS" && exam.note_enseignant && !exam.mon_avis && (
                        <button
                          onClick={() => {
                            // Rating navigation handled by parent
                          }}
                          className="flex-1 md:flex-auto py-3 rounded-xl bg-amber-600 text-xs font-black text-white uppercase tracking-wider hover:bg-amber-700 transition-colors"
                        >
                          Noter l'enseignant
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {paymentModalOpen && (
        <ExamPaymentModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onSuccess={() => {
            setPaymentModalOpen(false);
            toast.success("Paiement confirmé ! Inscription validée.");
            fetchExams();
          }}
          examId={paymentExamId}
          amount={paymentAmount}
        />
      )}
    </div>
  );
}
