import React, { useState } from "react";
import { X, Phone, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { apiUrl } from "../../lib/api";

interface ExamPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  examId: string;
  amount: number;
  phone?: string;
  deadlineAt?: string;
}

export function ExamPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  examId,
  amount,
  phone: initialPhone = "",
  deadlineAt,
}: ExamPaymentModalProps) {
  const [step, setStep] = useState<"phone" | "polling" | "success" | "error">("phone");
  const [operator, setOperator] = useState<"airtel" | null>(null);
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Confirmez le paiement sur votre téléphone");
  const [isProcessing, setIsProcessing] = useState(false);
  const [retryAllowed, setRetryAllowed] = useState(true);

  const validatePhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 2) return "";
    if (!/^0[45]/.test(digits)) return "Le numéro doit commencer par 04 ou 05 (Airtel).";
    if (digits.length > 0 && digits.length < 9) return "Le numéro doit contenir au moins 9 chiffres.";
    return "";
  };

  const handleConfirm = async () => {
    if (isProcessing) return;
    if (deadlineAt && Date.now() >= new Date(deadlineAt).getTime()) {
      setRetryAllowed(false);
      setMessage("La période d’inscription est terminée. Le paiement est fermé depuis le début de l’épreuve.");
      setStep("error");
      return;
    }
    const phoneError = validatePhone(phone);
    if (!operator || phone.replace(/\D/g, "").length < 9 || phoneError) {
      setError(phoneError || "Saisissez un numéro Airtel valide d'au moins 9 chiffres.");
      return;
    }
    setError("");
    setIsProcessing(true);
    setStep("polling");
    setMessage("Envoi de la demande Mobile Money...");

    try {
      const response = await fetch(apiUrl(`/api/exams/${encodeURIComponent(examId)}/payments/initiate`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `+242${phone.replace(/\D/g, "")}` }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Session expirée. Veuillez vous reconnecter.");
      if (!response.ok) throw new Error(data.error || "Impossible d'initier le paiement");

      setMessage("Confirmez le paiement sur votre téléphone, puis gardez cette fenêtre ouverte.");

      const verificationTimeoutMs = 60_000;
      const pollingIntervalMs = 3_000;
      const startedAt = Date.now();

      while (Date.now() - startedAt < verificationTimeoutMs) {
        const statusRes = await fetch(apiUrl(`/api/exams/payments/${encodeURIComponent(data.payment.reference)}/status`), {
          method: "GET",
          credentials: "include",
        });
        const statusData = await statusRes.json().catch(() => ({}));
        const providerStatus = String(statusData.status || "");

        if (providerStatus === "200" || providerStatus === "SUCCESS") {
          setStep("success");
          setMessage("Paiement confirmé !");
          await onSuccess();
          return;
        }
        if (providerStatus === "3" || providerStatus === "FAILED") {
          setStep("error");
          setMessage(statusData.message || "Paiement refusé.");
          return;
        }
        await new Promise((r) => setTimeout(r, pollingIntervalMs));
      }

      setStep("error");
      setMessage("Délai d'attente dépassé. Vérifiez votre paiement.");
    } catch (err) {
      setStep("error");
      const errorMessage = err instanceof Error ? err.message : "Erreur lors du paiement.";
      setError(errorMessage);
      setRetryAllowed(!errorMessage.toLocaleLowerCase("fr-FR").includes("période d’inscription"));
    } finally {
      // Réactive le formulaire après un refus ou un délai dépassé afin que
      // l'élève puisse relancer le paiement sans fermer la fenêtre.
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-[28px] border border-white/60 bg-white shadow-[0_30px_100px_rgba(2,6,23,.4)]">
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 px-6 pb-6 pt-5 text-white">
          <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full border-[24px] border-white/5" />
          <div className="relative flex items-start justify-between">
            <div><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.16em] text-emerald-50">Paiement Airtel Money</span><h2 className="mt-3 text-xl font-black">Confirmer l’inscription</h2><p className="mt-1 text-xs text-emerald-50/75">Un message de validation sera envoyé sur votre téléphone.</p></div>
            <button type="button" onClick={onClose} aria-label="Fermer la fenêtre de paiement" className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"><X size={17} /></button>
          </div>
          <div className="relative mt-5 flex items-end justify-between rounded-2xl border border-white/10 bg-white/10 p-4">
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-50/70">Montant à régler</p><p className="mt-1 text-3xl font-black">{amount.toLocaleString("fr-FR")} <span className="text-sm">FCFA</span></p></div>
            {deadlineAt && <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-50/70">Avant le début</p><p className="mt-1 text-xs font-black">{new Date(deadlineAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>}
          </div>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          {step === "phone" && (
            <>
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-wide text-slate-600">Opérateur mobile</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOperator("airtel")}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-black transition ${
                      operator === "airtel"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/10"
                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"
                    }`}
                  >
                    <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600"><Phone size={16} /></span><span>Airtel Money</span></span><span className="text-xs">{operator === "airtel" ? "Sélectionné ✓" : "Sélectionner"}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="exam-payment-phone" className="block text-xs font-black uppercase tracking-wide text-slate-600">Numéro Airtel Money</label>
                <input
                  id="exam-payment-phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="05 000 00 00"
                  autoComplete="tel-national"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-base font-bold tracking-wide text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                />
                <p className="text-[11px] leading-5 text-slate-500">Saisissez un numéro Airtel du Congo commençant par 04 ou 05.</p>
              </div>

              {error && (
                  <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
                  {error}
                </div>
              )}

              <button
                onClick={handleConfirm}
                disabled={isProcessing}
                className={`w-full rounded-xl py-3.5 text-xs font-black uppercase tracking-wider shadow-sm transition ${
                  operator && phone.replace(/\D/g, "").length >= 9 && !error
                    ? "bg-gradient-to-r from-emerald-700 to-teal-600 text-white hover:-translate-y-0.5 hover:from-emerald-800 hover:to-teal-700"
                    : "cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                {isProcessing ? "Envoi…" : "Confirmer le paiement"}
              </button>
            </>
          )}
          {step === "polling" && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
              <div className="flex items-center gap-3 text-blue-800"><Clock className="h-5 w-5 animate-spin" /><span className="font-black">Paiement en attente</span></div>
              <p className="mt-3 text-sm leading-6 text-blue-900">{message}</p>
              <div className="mt-3 text-xs font-semibold text-blue-700">Vérification automatique toutes les 3 secondes…</div>
            </div>
          )}

          {step === "success" && (
            <div className="space-y-4 py-3 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
                <CheckCircle2 size={28} className="text-green-600" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Paiement réussi !</h3>
              <p className="text-sm text-slate-600">Votre inscription est confirmée. Retrouvez l’examen dans l’onglet « Mes examens ».</p>
              <button
                onClick={() => {
                  onClose();
                }}
                className="w-full rounded-xl bg-emerald-700 py-3 text-xs font-black text-white transition hover:bg-emerald-800"
              >
                Fermer
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="space-y-4 rounded-2xl border border-red-100 bg-red-50 p-5">
              <div className="flex items-center gap-3 text-red-600">
                <AlertCircle size={20} />
                <span className="font-medium">Erreur de paiement</span>
              </div>
              <p className="text-sm leading-6 text-slate-700">{error || message}</p>
              {retryAllowed ? (
                <button
                  onClick={() => {
                    setError("");
                    setMessage("Confirmez le paiement sur votre téléphone");
                    setStep("phone");
                  }}
                  className="w-full rounded-xl border border-red-200 bg-white py-3 text-xs font-black text-red-700 transition hover:bg-red-100"
                >Réessayer</button>
              ) : (
                <button onClick={onClose} className="w-full rounded-xl bg-slate-900 py-3 text-xs font-black text-white transition hover:bg-slate-800">Fermer</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
