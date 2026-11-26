import React, { useEffect, useState } from "react";
import { ChevronLeft, CalendarDays, Radio, ClipboardList, GraduationCap, Clock3, WalletCards, XCircle } from "lucide-react";
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

export function StudentExamsPage({ onLogout, onFeed, onExamCatalog, initialTab = "announced", onSelectExam, onOpenSession, user }: StudentExamsPageProps) {
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

  const requestCancellation = async (examId: string) => {
    try {
      const response = await fetch(apiUrl(`/api/exams/${encodeURIComponent(examId)}/cancellation-request`), {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Demande impossible");
      toast.success("Votre demande d’annulation a été envoyée.");
      await fetchExams();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Demande impossible");
    }
  };

  const statutLabels: Record<string, string> = {
    EN_ATTENTE_PAIEMENT: "En attente de paiement",
    PAYE: "Payé",
    GRATUIT_ABONNEMENT: "Gratuit (abonnement)",
    DEMANDE_ANNULATION: "Annulation demandée",
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

        <section className="relative mb-7 overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 p-6 text-white shadow-xl shadow-emerald-950/15 sm:p-8">
          <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full border-[34px] border-white/5" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-50"><GraduationCap size={14} /> Espace examens élève</span>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Vos examens, au même endroit.</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/80">Consultez les annonces, rejoignez une session ouverte et suivez vos inscriptions.</p>
            </div>
            <button onClick={onFeed} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-black text-white transition hover:bg-white/20">
              <ChevronLeft size={15} /> Retour à l’accueil
            </button>
          </div>
          <div className="relative mt-7 grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100/70">Annoncés</p><p className="mt-1 text-2xl font-black">{announcedExams.length}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100/70">En cours</p><p className="mt-1 text-2xl font-black">{liveExams.length}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100/70">Mes inscriptions</p><p className="mt-1 text-2xl font-black">{exams.length}</p></div>
          </div>
        </section>

        <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-sm backdrop-blur sm:gap-3">
          <button onClick={() => setActiveTab("announced")} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-black transition sm:text-sm ${activeTab === "announced" ? "bg-emerald-800 text-white shadow-lg shadow-emerald-900/15" : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-900"}`}><CalendarDays size={16} /><span>Annoncés</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${activeTab === "announced" ? "bg-white/20" : "bg-slate-100"}`}>{announcedExams.length}</span></button>
          <button onClick={() => setActiveTab("live")} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-black transition sm:text-sm ${activeTab === "live" ? "bg-emerald-800 text-white shadow-lg shadow-emerald-900/15" : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-900"}`}><Radio size={16} /><span>En cours</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${activeTab === "live" ? "bg-white/20" : "bg-slate-100"}`}>{liveExams.length}</span></button>
          <button onClick={() => setActiveTab("registered")} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-black transition sm:text-sm ${activeTab === "registered" ? "bg-emerald-800 text-white shadow-lg shadow-emerald-900/15" : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-900"}`}><ClipboardList size={16} /><span>Mes examens</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${activeTab === "registered" ? "bg-white/20" : "bg-slate-100"}`}>{exams.length}</span></button>
        </div>

        {activeTab === "announced" || activeTab === "live" ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {(activeTab === "announced" ? announcedExams : liveExams).length === 0 ? <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white/80 p-12 text-center"><p className="font-bold text-slate-700">{activeTab === "announced" ? "Aucun examen annoncé pour le moment" : "Aucune session en cours"}</p><p className="mt-2 text-sm text-slate-500">Cette liste se met à jour automatiquement.</p></div> : (activeTab === "announced" ? announcedExams : liveExams).map(exam => {
              const registeredExam = exams.find(item => item.id_examen === exam.id_examen);
              const registered = Boolean(registeredExam && registeredExam.statut_inscription !== "ANNULE");
              const cancellationRequested = registeredExam?.statut_inscription === "DEMANDE_ANNULATION";
              return <article key={exam.id_examen} className="group relative overflow-hidden rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.07)] transition duration-200 hover:-translate-y-1 hover:shadow-xl"><div className={`absolute inset-x-0 top-0 h-1 ${activeTab === "live" ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gradient-to-r from-amber-400 to-orange-300"}`} /><div className="flex items-center justify-between gap-2 pt-1"><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${activeTab === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{activeTab === "live" ? "Session ouverte" : "Examen annoncé"}</span>{registered && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">Déjà inscrit</span>}</div><h2 className="mt-4 text-xl font-black leading-tight text-slate-900">{exam.titre}</h2><p className="mt-2 text-sm font-semibold text-slate-600">{exam.nom_matiere || "Matière"} <span className="text-slate-300">·</span> Niveau {exam.nom_classe || "—"}</p><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Début</p><p className="mt-1 text-xs font-bold text-slate-800">{new Date(exam.date_debut).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Durée · Prix</p><p className="mt-1 text-xs font-bold text-slate-800">{exam.duree_minutes} min · {Number(exam.prix_inscription || 0).toLocaleString("fr-FR")} FCFA</p></div></div>{activeTab === "live" && <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3"><div className="mb-2 flex items-center gap-2 text-xs font-black text-emerald-900"><Clock3 size={14}/> Temps restant</div><ExamCountdown endsAt={exam.date_fin}/></div>}{registered && activeTab === "announced" && (cancellationRequested ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-center text-xs font-bold text-amber-800">Demande d’annulation envoyée</p> : <button onClick={() => void requestCancellation(exam.id_examen)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-xs font-black text-red-700 transition hover:bg-red-50"><XCircle size={15}/> Demander l’annulation</button>)}<button onClick={() => { if (activeTab === "live" && registered) onOpenSession?.(exam); else if (registered) setActiveTab("registered"); else onSelectExam?.(exam); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3.5 text-xs font-black text-white transition hover:bg-emerald-800">{activeTab === "live" && registered ? "Ouvrir ma session" : activeTab === "live" ? "Voir les informations" : registered ? "Voir mon inscription" : "Consulter et s’inscrire"}<span aria-hidden="true">→</span></button></article>;
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
              const hasNote = exam.note != null;
              const hasCopy = Number(exam.copies_deposees || 0) > 0;
              const registrationClosed = new Date(exam.date_debut).getTime() <= Date.now() || effectiveStatus !== "ANNOUNCE";

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
                          Note : <span className="text-green-600">{exam.note}/20</span>
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
                      <p className="text-xs text-slate-400 uppercase font-bold">Avis sur l’enseignant</p>
                      <p className="text-sm font-black">{exam.note_enseignant ?? "—"}/5</p>
                    </div>
                  </div>

                  {effectiveStatus === "EN_COURS" && isPaid && <div className="mb-5 flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-emerald-900">Votre session est ouverte</p><p className="text-xs text-emerald-800">Ouvrez la page de session pour consulter le sujet et déposer vos copies.</p></div><ExamCountdown endsAt={exam.date_fin}/><button onClick={() => onOpenSession?.(exam)} className="rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white hover:bg-emerald-800">Ouvrir la session</button></div>}

                  {!isPaid && prix > 0 ? (
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 mb-4">
                      {registrationClosed ? (
                        <><p className="text-sm font-bold text-slate-800">La période d’inscription est terminée</p><p className="mt-1 text-xs text-slate-600">Le paiement est fermé depuis le début de l’épreuve ({new Date(exam.date_debut).toLocaleString("fr-FR")}).</p></>
                      ) : (
                        <><p className="text-sm font-bold text-amber-900">Paiement requis</p><p className="mt-1 text-xs text-amber-800">Réglez {prix.toLocaleString("fr-FR")} FCFA avant le début de l’épreuve pour confirmer votre inscription.</p><button onClick={() => handlePay(exam.id_examen, prix)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 px-4 py-3 text-xs font-black text-white shadow-md shadow-amber-900/10 transition hover:-translate-y-0.5 hover:from-amber-700 hover:to-orange-600"><WalletCards size={16}/> Payer {prix.toLocaleString("fr-FR")} FCFA</button></>
                      )}
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
                            {exam.note}/20
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
          deadlineAt={exams.find(exam => exam.id_examen === paymentExamId)?.date_debut}
        />
      )}
    </div>
  );
}
