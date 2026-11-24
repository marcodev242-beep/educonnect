import React, { useEffect, useState } from "react";
import { ChevronLeft, BookOpen, GraduationCap, Clock, User, Star, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { DashboardHeader } from "../components/DashboardHeader";
import { ExamPaymentModal } from "../components/ExamPaymentModal";
import { TeacherSubscriptionModal } from "../components/TeacherSubscriptionModal";
import { StarRating } from "../components/StarRating";
import { Exam } from "../types";
import { apiUrl } from "../../lib/api";
import { toast } from "sonner";

interface ExamDetailPageProps {
  onLogout: () => void;
  onFeed: () => void;
  user: { id: string; name: string; role: string };
  examId: string;
}

export function ExamDetailPage({ onLogout, onFeed, user, examId }: ExamDetailPageProps) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollmentStatus, setEnrollmentStatus] = useState<"idle" | "enrolled" | "payment_required" | "paid">("idle");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const fetchExam = async (silent = false) => {
    try {
      const res = await fetch(apiUrl(`/api/exams/${encodeURIComponent(examId)}`), { credentials: "include" });
      if (!res.ok) throw new Error("Examen introuvable");
      const data = await res.json();
      setExam(data.exam || data);
      const enrollmentStatus = data.enrollment?.statut;
      if (["PAYE", "GRATUIT_ABONNEMENT"].includes(enrollmentStatus)) setEnrollmentStatus("paid");
      else if (enrollmentStatus === "EN_ATTENTE_PAIEMENT") setEnrollmentStatus("payment_required");
      else setEnrollmentStatus("idle");
    } catch (error) {
      console.error("Erreur chargement examen:", error);
      if (!silent) toast.error("Impossible de charger l'examen");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchExam();
    const refresh = window.setInterval(() => void fetchExam(true), 15_000);
    return () => window.clearInterval(refresh);
  }, [examId]);

  useEffect(() => {
    const clock = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, []);

  const handleEnroll = async () => {
    if (!exam) return;
    try {
      const res = await fetch(apiUrl(`/api/exams/${encodeURIComponent(examId)}/enroll`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 401) throw new Error("Session expirée");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Inscription impossible");

      if (data.requiresPayment && !data.viaSubscription) {
        setEnrollmentStatus("payment_required");
        setPaymentAmount(data.amount);
        setPaymentModalOpen(true);
      } else if (data.viaSubscription) {
        setEnrollmentStatus("enrolled");
        toast.success("Inscription confirmée (accès via abonnement)");
        fetchExam();
      } else {
        setEnrollmentStatus("paid");
        toast.success("Inscription confirmée (examen gratuit)");
        fetchExam();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erreur d'inscription";
      if (msg.includes("abonnement") || msg.includes("subscription")) {
        setSubscriptionModalOpen(true);
      } else {
        toast.error(msg);
      }
    }
  };

  const handleSubscribeTeacher = async () => {
    if (!exam) return;
    setSubscriptionModalOpen(true);
  };

  if (loading) {
    return (
      <div className="app-shell min-h-screen flex items-center justify-center text-slate-500">
        Chargement de l'examen…
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="app-shell min-h-screen flex items-center justify-center text-slate-500">
        Examen introuvable.
      </div>
    );
  }

  const price = Number(exam.prix_inscription || 0);
  const isFree = price <= 0;
  const registrationOpen = exam.statut === "ANNOUNCE" && currentTime < new Date(exam.date_debut).getTime();
  const formattedStart = new Date(exam.date_debut).toLocaleDateString("fr-FR", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const formattedEnd = new Date(exam.date_fin).toLocaleDateString("fr-FR", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="app-shell min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">
        <DashboardHeader role="student" name={user.name} onLogout={onLogout} onFeed={onFeed} />

        <button
          onClick={onFeed}
          className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft size={14} /> Retour catalogue
        </button>

        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 md:p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-[0.12em] ${
                  exam.statut === "EN_COURS" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                  exam.statut === "ANNOUNCE" ? "bg-amber-50 text-amber-700 border-amber-100" :
                  "bg-slate-50 text-slate-700 border-slate-100"
                }`}>
                  {exam.statut === "EN_COURS" ? "En cours" : exam.statut === "ANNOUNCE" ? "Annonce" : exam.statut}
                </span>
                {exam.statut === "EN_COURS" && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border-green-100">
                    Dépôt des copies ouvert
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-black text-slate-900 mb-2">{exam.titre}</h1>
              <p className="text-slate-600 mb-6">{exam.description}</p>
              {exam.statut === "EN_COURS" && enrollmentStatus === "paid" && <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="mb-3 text-sm font-black text-emerald-900">Sujet de l’examen — session ouverte</p><div className="flex flex-wrap gap-2">{(Array.isArray((exam as any).fichiers_sujets) ? (exam as any).fichiers_sujets : []).map((file: any, index: number) => <a key={index} href={apiUrl(`/api/exams/${encodeURIComponent(examId)}/subjects/${index}`)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-800 shadow-sm"><FileText size={14} />{file.name || `Sujet ${index + 1}`}</a>)}{!(Array.isArray((exam as any).fichiers_sujets) && (exam as any).fichiers_sujets.length) && (exam as any).url_sujet && (exam as any).url_sujet !== "#" && <a href={apiUrl(`/api/exams/${encodeURIComponent(examId)}/subjects/0`)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-800 shadow-sm"><FileText size={14} />Télécharger le sujet</a>}</div></div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-xs text-slate-400 uppercase font-bold">Matière</p>
                  <p className="text-sm font-black">{exam.nom_matiere}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-xs text-slate-400 uppercase font-bold">Classe / Niveau</p>
                  <p className="text-sm font-black">{exam.nom_classe}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-xs text-slate-400 uppercase font-bold">Durée</p>
                  <p className="text-sm font-black">{exam.duree_minutes} minutes</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-xs text-slate-400 uppercase font-bold">Places</p>
                  <p className="text-sm font-black">{exam.places_max ?? "Illimité"}</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-slate-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase">Début</p>
                    <p className="text-sm font-black">{formattedStart}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-slate-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase">Fin</p>
                    <p className="text-sm font-black">{formattedEnd}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-slate-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase">Enseignant</p>
                    <p className="text-sm font-black">{exam.nom_enseignant || "—"}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Inscription</h3>
                {enrollmentStatus === "enrolled" ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">Déjà inscrit</p>
                      <p className="text-xs text-emerald-600">Vous pouvez déposer votre copie quand l'examen sera en cours.</p>
                    </div>
                  </div>
                ) : enrollmentStatus === "paid" ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">Inscription confirmée</p>
                      <p className="text-xs text-emerald-600">Paiement validé. Vous pouvez déposer votre copie.</p>
                    </div>
                  </div>
                ) : enrollmentStatus === "payment_required" ? (
                  registrationOpen ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-black text-amber-950">Inscription en attente de paiement</p><p className="mt-1 text-xs leading-5 text-amber-900">Le règlement doit être effectué avant le début de l’épreuve, le {formattedStart}.</p><button onClick={() => { setPaymentAmount(price); setPaymentModalOpen(true); }} className="mt-4 w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 py-3 text-xs font-black text-white shadow-sm transition hover:from-amber-700 hover:to-orange-600">Payer {price.toLocaleString("fr-FR")} FCFA</button></div>
                    : <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">La période d’inscription est terminée. Le paiement est fermé depuis le début de l’épreuve.</div>
                ) : !registrationOpen ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    {currentTime >= new Date(exam.date_fin).getTime() ? "Cette session est terminée." : "La période d’inscription est fermée. Le paiement n’est plus disponible après l’heure de début."}
                  </div>
                ) : (
                  <>
                    <div className="mb-4">
                      {isFree ? (
                        <p className="text-sm font-bold text-emerald-700">Examen gratuit - inscription sans paiement</p>
                      ) : (
                        <p className="text-sm font-bold text-slate-800">
                          Prix d'inscription : <span className="text-green-600">{price.toLocaleString("fr-FR")} FCFA</span>
                        </p>
                      )}
                    </div>
                    <button
                      onClick={handleEnroll}
                      className={`w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-colors ${
                        isFree || String(enrollmentStatus) === "paid"
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                    >
                      {isFree ? "S'inscrire gratuitement" : "S'inscrire et payer"}
                    </button>
                    {!isFree && String(enrollmentStatus) !== "paid" && (
                      <button
                        onClick={handleSubscribeTeacher}
                        className="mt-3 w-full py-3 rounded-xl border border-slate-200 text-sm font-black text-slate-700 uppercase tracking-wider hover:bg-slate-50 transition-colors"
                      >
                        Ou s'abonner aux examens de cet enseignant
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="lg:w-[340px] flex-shrink-0">
              <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Profil enseignant</h3>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-green-600 text-xl font-black">
                    {(exam.nom_enseignant || "E").split(" ").map((p) => p[0]).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-black">{exam.nom_enseignant || "Enseignant"}</p>
                    <p className="text-xs text-slate-500">{exam.nom_matiere}</p>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 block">Avis moyen sur l’enseignant (sur 5)</label>
                  <div className="flex items-center gap-2">
                    <StarRating value={exam.note_enseignant ?? 0} readOnly size={18} />
                    <span className="text-xs font-bold text-slate-700">{exam.note_enseignant?.toFixed(1) || "0"}/5</span>
                    {exam.nombre_avis != null && (
                      <span className="text-[10px] text-slate-400 ml-1">({exam.nombre_avis} avis)</span>
                    )}
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Détails</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Cet examen est organisé par l'enseignant. L'inscription est{isFree ? " gratuite" : " payante"}.
                    Une fois inscrit, vous pourrez déposer votre copie (PDF, image) pendant la période de l'examen.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {paymentModalOpen && (
        <ExamPaymentModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onSuccess={() => {
            setPaymentModalOpen(false);
            setEnrollmentStatus("paid");
            toast.success("Paiement confirmé ! Vous êtes inscrit.");
            fetchExam();
          }}
          examId={exam.id_examen}
          amount={paymentAmount}
          deadlineAt={exam.date_debut}
        />
      )}

      {subscriptionModalOpen && (
        <TeacherSubscriptionModal
          isOpen={subscriptionModalOpen}
          onClose={() => setSubscriptionModalOpen(false)}
          onSuccess={() => {
            setSubscriptionModalOpen(false);
            setEnrollmentStatus("enrolled");
            toast.success("Abonnement activé ! Vous avez accès aux examens de cet enseignant.");
            fetchExam();
          }}
          teacherId={exam.id_enseignant}
          amount={500}
          teacherName={exam.nom_enseignant || "cet enseignant"}
        />
      )}
    </div>
  );
}
