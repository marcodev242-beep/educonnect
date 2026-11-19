import React, { useState } from "react";
import { X, CheckCircle, Download, Phone, AlertCircle, RotateCcw } from "lucide-react";
import { PaymentStep, Paper } from "../types";
import { apiUrl } from "../../lib/api";

export function PaymentModal({
  paper,
  papers,
  onClose,
  onSuccess,
  userId,
}: {
  paper?: Paper;
  papers?: Paper[];
  onClose: () => void;
  onSuccess: (items: Paper[]) => void | Promise<void>;
  userId: string;
}) {
  const [step, setStep] = useState<PaymentStep>("operator");
  const [operator, setOperator] = useState<"airtel" | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("Confirmez le paiement sur votre téléphone");
  const items = papers?.length ? papers : paper ? [paper] : [];
  const total = items.reduce((sum, item) => sum + item.price, 0);
  const title = items.length > 1 ? `${items.length} sujets dans le panier` : items[0]?.title || "Paiement";
  const [isProcessing, setIsProcessing] = useState(false);

  const validatePhoneForOperator = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 2) return "";
    if (operator === "airtel" && !/^0[45]/.test(digits)) return "Le numéro saisi n’est pas un numéro Airtel. Un numéro Airtel doit commencer par 04 ou 05.";
    if (digits.length > 0 && digits.length < 9) return "Le numéro doit contenir au moins 9 chiffres après +242.";
    return "";
  };

  const handleConfirm = async () => {
    if (isProcessing) return;
    const phoneError = validatePhoneForOperator(phone);
    if (!operator || phone.replace(/\D/g, "").length < 9 || phoneError) {
      setError(phoneError || "Saisissez un numéro Airtel valide d’au moins 9 chiffres.");
      return;
    }
    setError("");
    setIsProcessing(true);
    setStep("ussd");
    setStatusMessage("Envoi de la demande Mobile Money...");
    let providerDeclined = false;
    try {
      const response = await fetch(apiUrl("/api/payments/initiate"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          operator,
          phone: `+242${phone.replace(/\D/g, "")}`,
          documentIds: items.map(item => item.id),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Votre session a expiré. Veuillez vous reconnecter.");
      if (!response.ok) throw new Error(data.error || "Impossible d'initier le paiement");
      setStep("ussd");
      setStatusMessage("Confirmez le paiement sur votre téléphone, puis gardez cette fenêtre ouverte.");

      const transactionIds = Array.isArray(data.transactionIds) ? data.transactionIds as string[] : [];
      if (transactionIds.length !== items.length) throw new Error("Identifiants de paiement manquants");
      await new Promise(resolve => window.setTimeout(resolve, 10_000));
      const verificationTimeoutMs = 60_000;
      const pollingIntervalMs = 3_000;
      const verificationStartedAt = Date.now();

      while (Date.now() - verificationStartedAt < verificationTimeoutMs) {
        const statuses = await Promise.all(transactionIds.map(async transactionId => {
          const statusResponse = await fetch(apiUrl(`/api/payments/${encodeURIComponent(transactionId)}/status`), {
            method: "GET",
            credentials: "include",
          });
          if (!statusResponse.ok) return { status: "PENDING", message: "Vérification YabisoPay en cours..." };
          const statusData = await statusResponse.json().catch(() => ({}));
          if (typeof statusData.message === "string" && statusData.message.trim()) setStatusMessage(statusData.message);
          return { status: statusData.status as string, message: statusData.message as string | undefined };
        }));
        if (statuses.every(result => result.status === "200" || result.status === "SUCCESS")) {
          setStep("success");
          void onSuccess(items);
          return;
        }
        const failedPayment = statuses.find(result => result.status === "3" || result.status === "FAILED");
        if (failedPayment) {
          providerDeclined = failedPayment.status === "3";
          throw new Error(failedPayment.message || "Paiement refusé. Vérifiez votre numéro ou réessayez.");
        }

        const remainingMs = verificationTimeoutMs - (Date.now() - verificationStartedAt);
        if (remainingMs <= 0) break;
        await new Promise(resolve => window.setTimeout(resolve, Math.min(pollingIntervalMs, remainingMs)));
      }
      setStatusMessage("Aucune confirmation reçue après une minute.");
      setError("La vérification est arrêtée. Si votre compte est débité, le paiement sera traité dès réception de la confirmation.");
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Erreur de paiement");
      setStep(providerDeclined ? "failed" : "phone");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17241f]/55 backdrop-blur-sm p-4">
    <div className="payment-dialog max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto">
        {step !== "success" && (
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-bold text-slate-900">Paiement Mobile Money</h2>
              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">{title}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 transition-colors">
              <X size={16} className="text-slate-500" />
            </button>
          </div>
        )}

        <div className="p-5">
          {step === "operator" && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-600">Choisissez votre opérateur</p>
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => { setOperator("airtel"); setStep("phone"); }}
                  className="flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 border-slate-100 hover:border-red-500 hover:bg-red-50 transition-all"
                >
                  <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-sm">
                    <span className="text-xs font-black text-white">AIR</span>
                  </div>
                  <span className="text-xs font-bold text-slate-700">Airtel Money</span>
                </button>
              </div>
              <div className="bg-green-50 rounded-xl p-3 flex items-center justify-between">
                <span className="text-sm text-slate-500">Montant total</span>
                <span className="text-xl font-black text-emerald-900">{total.toLocaleString("fr-FR")} FCFA</span>
              </div>
            </div>
          )}

          {step === "failed" && (
            <div className="space-y-5 py-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertCircle size={32} />
              </div>
              <div>
                <p className="text-lg font-black text-slate-900">Paiement échoué</p>
                <p className="mt-2 text-sm text-slate-600">{error || "Paiement refusé. Vérifiez votre numéro ou réessayez."}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
                  Annuler
                </button>
                <button type="button" onClick={() => { setError(""); void handleConfirm(); }} disabled={isProcessing} className="primary-button flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold disabled:opacity-60">
                  <RotateCcw size={15} /> Réessayer
                </button>
              </div>
            </div>
          )}

          {step === "phone" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-600">
                  <span className="text-[9px] font-black text-white">AIR</span>
                </div>
                <span className="text-sm font-semibold text-slate-700">
                  Airtel Money
                </span>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Numéro de téléphone</label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2.5 focus-within:border-emerald-800 focus-within:ring-2 focus-within:ring-amber-100 transition-all">
                  <span className="text-sm text-slate-400 font-semibold">+242</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => {
                      const value = e.target.value;
                      setPhone(value);
                      setError(validatePhoneForOperator(value));
                    }}
                    placeholder="05 XXX XX XX"
                    className="flex-1 outline-none text-sm text-slate-800 placeholder:text-slate-300"
                  />
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Document</span>
                  <span className="text-slate-600 font-semibold truncate max-w-[160px] text-right">{title}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Opérateur</span>
                  <span className="text-slate-600 font-semibold">Airtel Money</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-200 pt-2 mt-1">
                  <span className="text-slate-500 font-semibold">Montant</span>
                  <span className="font-black text-emerald-900">{total.toLocaleString("fr-FR")} FCFA</span>
                </div>
              </div>
              <button
                onClick={handleConfirm}
                disabled={isProcessing || phone.replace(/\D/g, "").length < 9 || Boolean(validatePhoneForOperator(phone))}
                className="primary-button w-full disabled:bg-slate-100 disabled:text-slate-300 font-bold py-3 rounded-lg transition-colors"
              >
                {isProcessing ? "Traitement en cours..." : "Confirmer le paiement"}
              </button>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
            </div>
          )}

          {step === "ussd" && (
            <div className="text-center py-4 space-y-5">
              <div className="w-32 h-52 bg-slate-900 rounded-[20px] mx-auto flex flex-col overflow-hidden border-4 border-slate-700 shadow-xl">
                <div className="h-5 bg-slate-800 flex items-center justify-center gap-1">
                  <div className="w-10 h-1.5 bg-slate-600 rounded-full" />
                </div>
                <div className="flex-1 bg-slate-100 p-2 flex flex-col items-center justify-center text-center gap-1">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center mb-1 bg-red-600">
                    <Phone size={14} className="text-white" />
                  </div>
                  <p className="text-[8px] font-black text-slate-800">Airtel Money</p>
                  <p className="text-[7px] text-slate-500 leading-tight">Confirmer paiement à<br />EduConnect Congo</p>
                  <p className="text-[11px] font-black text-green-600">{total.toLocaleString("fr-FR")} FCFA</p>
                  <div className="flex gap-1.5 mt-1">
                    <div className="bg-green-500 text-white text-[7px] px-2 py-0.5 rounded-full font-bold">OUI</div>
                    <div className="bg-red-400 text-white text-[7px] px-2 py-0.5 rounded-full font-bold">NON</div>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Demande Mobile Money envoyée</p>
                <p className="text-xs text-slate-500 mt-0.5">{statusMessage}</p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                En attente de confirmation...
              </div>
              {error && <p className="rounded-xl bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-700">{error}</p>}
            </div>
          )}

          {step === "success" && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <div>
                <p className="text-xl font-black text-slate-900">Paiement réussi !</p>
                <p className="text-sm text-slate-400 mt-1">Les sujets validés sont disponibles dans votre compte</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-3 font-medium">{title}</p>
                <button
                  onClick={async () => {
                    await onSuccess(items);
                    items.forEach(item => {
                      if (!item.fileUrl) return;
                      const link = document.createElement("a");
                      link.href = item.fileUrl;
                      link.download = `${(item.title || "document").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.pdf`;
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                    });
                    onClose();
                  }}
                  className="primary-button w-full font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Download size={15} /> Télécharger le PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
