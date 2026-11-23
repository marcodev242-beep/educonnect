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
}

export function ExamPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  examId,
  amount,
  phone: initialPhone = "",
}: ExamPaymentModalProps) {
  const [step, setStep] = useState<"phone" | "polling" | "success" | "error">("phone");
  const [operator, setOperator] = useState<"airtel" | null>(null);
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Confirmez le paiement sur votre téléphone");
  const [isProcessing, setIsProcessing] = useState(false);

  const validatePhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 2) return "";
    if (!/^0[45]/.test(digits)) return "Le numéro doit commencer par 04 ou 05 (Airtel).";
    if (digits.length > 0 && digits.length < 9) return "Le numéro doit contenir au moins 9 chiffres.";
    return "";
  };

  const handleConfirm = async () => {
    if (isProcessing) return;
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
      setError(err instanceof Error ? err.message : "Erreur lors du paiement.");
    } finally {
      // Réactive le formulaire après un refus ou un délai dépassé afin que
      // l'élève puisse relancer le paiement sans fermer la fenêtre.
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-slate-900">Paiement inscription</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {step === "phone" && (
            <>
              <div className="space-y-2 text-sm">
                <p className="font-bold text-slate-800">Montant : {amount.toLocaleString("fr-FR")} FCFA</p>
                <p className="text-slate-500">Paiement par Airtel Money</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 block">Opérateur</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOperator("airtel")}
                    className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-colors ${
                      operator === "airtel"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-slate-200 text-slate-600 hover:border-green-300"
                    }`}
                  >
                    <Phone size={14} className="mr-1" /> Airtel
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 block">Numéro de téléphone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex: 05 XX XX XX XX"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                  {error}
                </div>
              )}

              <button
                onClick={handleConfirm}
                disabled={isProcessing}
                className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-colors ${
                  operator && phone.replace(/\D/g, "").length >= 9 && !error
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                {isProcessing ? "Envoi…" : "Confirmer le paiement"}
              </button>
            </>
          )}
          {step === "polling" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-blue-600">
                <Clock className="h-5 w-5 animate-spin" />
                <span className="font-medium">Paiement en attente</span>
              </div>
              <p className="text-sm text-slate-600">{message}</p>
              <div className="text-xs text-slate-500">Vérification toutes les 3 secondes…</div>
            </div>
          )}

          {step === "success" && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} className="text-green-600" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Paiement réussi !</h3>
              <p className="text-sm text-slate-600">Votre inscription est confirmée.</p>
              <button
                onClick={() => {
                  onClose();
                }}
                className="w-full bg-green-600 py-2.5 rounded-xl text-xs font-black text-white hover:bg-green-700"
              >
                Fermer
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-red-600">
                <AlertCircle size={20} />
                <span className="font-medium">Erreur de paiement</span>
              </div>
              <p className="text-sm text-slate-600">{error || message}</p>
              <button
                onClick={() => {
                  setError("");
                  setMessage("Confirmez le paiement sur votre téléphone");
                  setStep("phone");
                }}
                className="w-full py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Réessayer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
