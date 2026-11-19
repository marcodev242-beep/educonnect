import React, { useEffect, useMemo, useState } from "react";
import { Building2, CreditCard, Download, Edit3, FileText, Printer, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DashboardHeader } from "../components/DashboardHeader";
import { AuthUser, Paper } from "../types";
import { apiUrl } from "../../lib/api";

type SchoolTab = "downloads" | "profile";

type SubscriptionState = {
  active: boolean;
  plan: string;
  startedAt: string;
  expiresAt: string;
};

export function SchoolDashboard({
  onLogout,
  onFeed,
  user,
  onCatalogRefresh,
}: {
  onLogout: () => void;
  onFeed: () => void;
  user: AuthUser;
  onCatalogRefresh?: () => void;
}) {
  const [tab, setTab] = useState<SchoolTab>("downloads");
  const [schoolProfile, setSchoolProfile] = useState({
    id: "",
    name: user.name,
    agrement: "",
    email: user.email,
    phone: "",
    city: "",
    createdAt: "",
  });
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: user.name, city: "", phone: "", agrement: "" });
  const [profileStatus, setProfileStatus] = useState<{ success: string; error: string }>({ success: "", error: "" });
  const [catalogPapers, setCatalogPapers] = useState<Paper[]>([]);
  const [downloadedPaperIds, setDownloadedPaperIds] = useState<string[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionState>({
    active: false,
    plan: "Mensuel",
    startedAt: "",
    expiresAt: "",
  });
  const [subscriptionPaymentPending, setSubscriptionPaymentPending] = useState(false);
  const [subscriptionMonthlyPrice, setSubscriptionMonthlyPrice] = useState<number | null>(null);
  const [subscriptionPaymentPhone, setSubscriptionPaymentPhone] = useState("");

  const downloadsKey = `educonnect-school-downloads-${user.id}`;

  const fetchSchoolProfile = async () => {
    try {
      const res = await fetch(`/api/school/profile?schoolId=${encodeURIComponent(user.id)}`);
      if (!res.ok) throw new Error("Impossible de charger le profil");
      const data = await res.json();
      setSchoolProfile(data.profile || schoolProfile);
      setSubscriptionPaymentPhone(data.profile?.phone || "");
      setProfileForm({
        name: data.profile?.name || user.name,
        city: data.profile?.city || "",
        phone: data.profile?.phone || "",
        agrement: data.profile?.agrement || "",
      });
    } catch (e) {
      console.error("Impossible de charger le profil ecole", e);
    }
  };

  useEffect(() => {
    try {
      const savedDownloads = localStorage.getItem(downloadsKey);
      if (savedDownloads) {
        setDownloadedPaperIds(JSON.parse(savedDownloads));
      }
    } catch (error) {
      console.error("Impossible de restaurer la souscription", error);
    }

    fetchSchoolProfile();
    fetch('/api/school/subscription')
      .then(res => {
        if (!res.ok) throw new Error("Impossible de charger l'abonnement")
        return res.json()
      })
      .then(data => {
        setSubscriptionMonthlyPrice(Number.isFinite(Number(data.monthlyPrice)) ? Number(data.monthlyPrice) : null);
        const remote = data.subscription;
        if (remote) setSubscription({
          active: Boolean(remote.active),
          plan: remote.plan || 'Mensuel',
          startedAt: remote.date_debut || '',
          expiresAt: remote.date_fin || '',
        });
      })
      .catch(error => {
        console.error("Impossible de charger l'abonnement", error)
        setSubscription({ active: false, plan: "Mensuel", startedAt: "", expiresAt: "" })
      });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch('/api/auth/timezone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    }).catch(error => console.error('Impossible de synchroniser le fuseau horaire', error));
    fetch("/api/catalog")
      .then(res => res.json())
      .then(data => setCatalogPapers(data.papers || []))
      .catch(error => console.error("Impossible de charger le catalogue ecole", error));
  }, [user.id]);

  const isSubscriptionActive = () => {
    if (!subscription.active) return false;
    return new Date(subscription.expiresAt).getTime() > Date.now();
  };

  const activateSubscription = async () => {
    if (!subscriptionPaymentPhone.trim()) {
      toast.error("Saisissez le numéro Airtel Money qui servira à payer l’abonnement.");
      return;
    }
    setSubscriptionPaymentPending(true);
    try {
      const response = await fetch(apiUrl('/api/school/subscription'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: subscriptionPaymentPhone, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Votre session a expiré. Veuillez vous reconnecter.");
      if (!response.ok) throw new Error(data.error || "Impossible d'initier le paiement");
      const reference = data.payment?.reference;
      if (!reference) throw new Error("Référence de paiement manquante");
      toast.info("Confirmez le paiement Airtel Money sur le téléphone de l’école.");
      const verificationTimeoutMs = 70_000;
      const pollingIntervalMs = 3_000;
      const verificationStartedAt = Date.now();

      while (Date.now() - verificationStartedAt < verificationTimeoutMs) {
        let statusResponse: Response;
        try {
          statusResponse = await fetch(apiUrl(`/api/school/subscription/payment/${encodeURIComponent(reference)}`), {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          });
        } catch (error) {
          console.warn("Vérification de l’abonnement indisponible, nouvelle tentative prévue.", error);
          const remainingMs = verificationTimeoutMs - (Date.now() - verificationStartedAt);
          if (remainingMs > 0) await new Promise(resolve => window.setTimeout(resolve, Math.min(pollingIntervalMs, remainingMs)));
          continue;
        }
        const statusData = await statusResponse.json().catch(() => ({}));
        if (statusResponse.status === 401) throw new Error("Votre session a expiré. Veuillez vous reconnecter.");
        if (!statusResponse.ok) {
          console.warn("Vérification de l’abonnement en attente.", statusData.error || statusResponse.status);
          const remainingMs = verificationTimeoutMs - (Date.now() - verificationStartedAt);
          if (remainingMs > 0) await new Promise(resolve => window.setTimeout(resolve, Math.min(pollingIntervalMs, remainingMs)));
          continue;
        }
        if (statusData.status === "SUCCESS") {
          const subscriptionResponse = await fetch(apiUrl('/api/school/subscription'), { credentials: 'include', cache: 'no-store' });
          const subscriptionData = await subscriptionResponse.json().catch(() => ({}));
          if (!subscriptionResponse.ok) throw new Error(subscriptionData.error || "Paiement confirmé, mais impossible de recharger l’abonnement.");
          const remote = subscriptionData.subscription;
          if (!remote?.active) throw new Error("Paiement confirmé. Actualisez la page pour recharger l’abonnement de l’école.");
          setSubscription({ active: true, plan: remote.plan || "Mensuel", startedAt: remote.date_debut || "", expiresAt: remote.date_fin || "" });
          toast.success("Paiement confirmé. L’abonnement de l’école est actif.");
          return;
        }
        if (statusData.status === "FAILED") throw new Error("Le paiement Airtel Money a échoué.");
        const remainingMs = verificationTimeoutMs - (Date.now() - verificationStartedAt);
        if (remainingMs <= 0) break;
        await new Promise(resolve => window.setTimeout(resolve, Math.min(pollingIntervalMs, remainingMs)));
      }
      toast.error("Aucune confirmation reçue après une minute. Le paiement est considéré comme échoué. Si votre compte a été débité, contactez le support.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'activer l'abonnement");
    } finally {
      setSubscriptionPaymentPending(false);
    }
  };

  const saveSchoolProfile = async () => {
    setProfileStatus({ success: "", error: "" });
    try {
      const res = await fetch("/api/school/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: user.id,
          name: profileForm.name,
          city: profileForm.city,
          phone: profileForm.phone,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Impossible de sauvegarder le profil");
      }
      setProfileStatus({ success: "Profil mis à jour avec succès.", error: "" });
      onCatalogRefresh?.();
      await fetchSchoolProfile();
      setProfileEditMode(false);
    } catch (e) {
      setProfileStatus({ success: "", error: e instanceof Error ? e.message : "Erreur inattendue" });
    }
  };

  const handleDownloadPaper = async (paper: Paper) => {
    try {
      const accessResponse = await fetch(`/api/school/access?documentId=${encodeURIComponent(paper.id)}`);
      if (!accessResponse.ok) throw new Error("Votre abonnement ne permet pas ce téléchargement.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Téléchargement non autorisé.");
      return;
    }
    const hasAccess = isSubscriptionActive() || downloadedPaperIds.includes(paper.id);
    if (!hasAccess) {
      toast.error("Votre abonnement est expiré. Réabonnez-vous pour télécharger les sujets.");
      return;
    }

    if (!paper.fileUrl) {
      toast.error("Aucun fichier n’est disponible pour ce sujet.");
      return;
    }

    const nextDownloads = downloadedPaperIds.includes(paper.id) ? downloadedPaperIds : [...downloadedPaperIds, paper.id];
    setDownloadedPaperIds(nextDownloads);
    localStorage.setItem(downloadsKey, JSON.stringify(nextDownloads));

    const link = document.createElement("a");
    link.href = paper.fileUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Téléchargement lancé : ${paper.title}`);
  };

  const handlePrintPaper = (paper: Paper) => {
    const hasAccess = isSubscriptionActive() || downloadedPaperIds.includes(paper.id);
    if (!hasAccess) {
      toast.error("Votre abonnement est expiré. Réabonnez-vous pour imprimer les sujets.");
      return;
    }

    if (!paper.fileUrl) {
      toast.error("Aucun fichier n’est disponible pour l’impression.");
      return;
    }

    const win = window.open(paper.fileUrl, "_blank", "noopener,noreferrer");
    if (win) {
      setTimeout(() => {
        try {
          win.print();
        } catch (error) {
          console.error("Impossible d’ouvrir l’impression", error);
        }
      }, 900);
    }
  };

  const downloadedPapers = catalogPapers.filter(paper => downloadedPaperIds.includes(paper.id)).sort((a, b) => {
    const levelOrder = ["Primaire", "Collège", "Lycée"].indexOf(a.level) - ["Primaire", "Collège", "Lycée"].indexOf(b.level);
    if (levelOrder !== 0) return levelOrder;
    return a.subject.localeCompare(b.subject, "fr") || a.title.localeCompare(b.title, "fr");
  });

  const groupedDownloadedPapers = useMemo(() => {
    return Object.entries(
      downloadedPapers.reduce((groups: Record<string, Record<string, Paper[]>>, paper) => {
        const level = paper.level || "Autre";
        const subject = paper.subject || "Autre";
        if (!groups[level]) groups[level] = {};
        if (!groups[level][subject]) groups[level][subject] = [];
        groups[level][subject].push(paper);
        return groups;
      }, {}),
    ).sort(([levelA], [levelB]) => {
      const order = ["Primaire", "Collège", "Lycée", "Autre"];
      return (order.indexOf(levelA) === -1 ? order.length : order.indexOf(levelA)) - (order.indexOf(levelB) === -1 ? order.length : order.indexOf(levelB));
    });
  }, [downloadedPapers]);

  const subscriptionStatus = isSubscriptionActive() ? "Actif" : "Expiré";

  return (
    <div className="app-shell min-h-screen">
      <DashboardHeader role="school" name={user.name} onLogout={onLogout} onFeed={onFeed} />
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">
        <div className="flex gap-1 mb-6 bg-white/85 rounded-xl p-1 border border-white/80 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
         {([
           ["downloads", "Mes sujets", Download],
           ["profile", "Profil établissement", Building2],
         ] as const).map(([value, label, Icon]) => (
           <button
             key={value}
             onClick={() => setTab(value)}
             className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === value ? "bg-green-600 text-white" : "text-slate-400 hover:text-slate-600"}`}
           >
             <Icon size={14} /> {label}
           </button>
         ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
         <div className="space-y-6">
           {tab === "downloads" && (
             <div className="space-y-5">
               {downloadedPapers.length === 0 ? (
                 <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500">
                   Aucun sujet téléchargé pour le moment.
                 </div>
               ) : (
                 groupedDownloadedPapers.map(([level, subjectsByLevel]) => (
                   <div key={level} className="space-y-4 rounded-2xl border border-white/70 bg-white/85 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                     <div className="flex items-center justify-between gap-3">
                       <h3 className="text-base font-black text-slate-900">{level}</h3>
                       <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-green-700">
                         {Object.values(subjectsByLevel).reduce((count, papers) => count + papers.length, 0)} sujets
                       </span>
                     </div>

                     <div className="space-y-4">
                       {Object.entries(subjectsByLevel)
                         .sort(([a], [b]) => a.localeCompare(b, "fr"))
                         .map(([subject, subjectPapers]) => (
                           <div key={`${level}-${subject}`} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                             <div className="flex items-center justify-between mb-2">
                               <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{subject}</span>
                               <span className="text-[10px] font-bold text-slate-400">{subjectPapers.length} document{subjectPapers.length > 1 ? 's' : ''}</span>
                             </div>

                             <div className="space-y-3">
                               {subjectPapers.map(paper => (
                                 <div key={paper.id} className="rounded-xl border border-white bg-white p-3 shadow-sm">
                                   <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                     <div className="min-w-0">
                                       <p className="text-sm font-black text-slate-900">{paper.title}</p>
                                       <p className="mt-1 text-[11px] text-slate-500">{paper.date} · {paper.teacher.name}</p>
                                     </div>
                                     <div className="flex gap-2">
                                       <button
                                         onClick={() => handlePrintPaper(paper)}
                                         className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                                       >
                                         <Printer size={14} /> Imprimer
                                       </button>
                                       <button
                                         onClick={() => handleDownloadPaper(paper)}
                                         className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-green-700"
                                       >
                                         <Download size={14} /> Télécharger
                                       </button>
                                     </div>
                                   </div>
                                 </div>
                               ))}
                             </div>
                           </div>
                         ))}
                     </div>
                   </div>
                 ))
               )}
             </div>
           )}

            {tab === "profile" && (
              <div className="rounded-2xl border border-white/70 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                {!profileEditMode ? (
                  <>
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 text-green-600 shadow-sm">
                        <Building2 size={28} />
                      </div>
                      <div>
                        <h2 className="font-bold text-slate-900">Profil de l’établissement</h2>
                        <p className="text-xs text-slate-400">Informations de votre école.</p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Nom</p>
                        <p className="text-sm text-slate-700">{schoolProfile.name || "Non renseigné"}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Ville</p>
                        <p className="text-sm text-slate-700">{schoolProfile.city || "Non renseigné"}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Email</p>
                        <p className="text-sm text-slate-700">{schoolProfile.email || "Non renseigné"}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Téléphone</p>
                        <p className="text-sm text-slate-700">{schoolProfile.phone || "Non renseigné"}</p>
                      </div>
                    </div>
                    <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Numéro agrément</p>
                      <p className="text-sm text-slate-700">{schoolProfile.agrement || "Non renseigné"}</p>
                    </div>
                    <button onClick={() => setProfileEditMode(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 transition-colors">
                      <Edit3 size={14} /> Modifier le profil
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 text-green-600 shadow-sm">
                        <Building2 size={28} />
                      </div>
                      <div>
                        <h2 className="font-bold text-slate-900">Modifier le profil</h2>
                        <p className="text-xs text-slate-400">Mettez à jour les informations de l’établissement.</p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="text-xs font-semibold text-slate-500 block">
                        Nom de l’établissement
                        <input value={profileForm.name} onChange={e => setProfileForm(prev => ({ ...prev, name: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1" />
                      </label>
                      <label className="text-xs font-semibold text-slate-500 block">
                        Ville
                        <input value={profileForm.city} onChange={e => setProfileForm(prev => ({ ...prev, city: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1" />
                      </label>
                      <label className="text-xs font-semibold text-slate-500 block">
                        Téléphone
                        <input value={profileForm.phone} onChange={e => setProfileForm(prev => ({ ...prev, phone: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1" />
                      </label>
                      <label className="text-xs font-semibold text-slate-500 block">
                        Numéro agrément
                        <input value={profileForm.agrement} disabled className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 bg-slate-50" />
                      </label>
                    </div>
                    <div className="mt-4 space-y-2">
                      {profileStatus.error && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{profileStatus.error}</div>}
                      {profileStatus.success && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{profileStatus.success}</div>}
                    </div>
                    <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <button onClick={saveSchoolProfile} className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl transition-colors">Enregistrer</button>
                      <button onClick={() => {
                        setProfileEditMode(false);
                        setProfileForm({
                          name: schoolProfile.name,
                          city: schoolProfile.city,
                          phone: schoolProfile.phone,
                          agrement: schoolProfile.agrement,
                        });
                        setProfileStatus({ success: "", error: "" });
                      }} className="w-full md:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl transition-colors">Annuler</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex items-center gap-2 text-green-700">
                <CreditCard size={16} />
                <p className="text-sm font-black">Abonnement</p>
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">État</p>
              <div className="mt-2 flex items-center gap-2">
                <ShieldCheck size={16} className={isSubscriptionActive() ? "text-emerald-600" : "text-amber-600"} />
                <span className={`text-sm font-black ${isSubscriptionActive() ? "text-emerald-700" : "text-amber-700"}`}>
                  {subscriptionStatus}
                </span>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Tarif mensuel</span>
                  <span className="font-black text-slate-900">{subscriptionMonthlyPrice === null ? "Non configuré" : `${subscriptionMonthlyPrice.toLocaleString("fr-FR")} FCFA`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Plan</span>
                  <span className="font-black text-slate-900">Mensuel</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>Début</span>
                  <span>{subscription.startedAt ? new Date(subscription.startedAt).toLocaleDateString("fr-FR") : "—"}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>Fin</span>
                  <span>{subscription.expiresAt ? new Date(subscription.expiresAt).toLocaleDateString("fr-FR") : "—"}</span>
                </div>
              </div>
              <label className="mt-4 block text-xs font-bold text-slate-600" htmlFor="subscription-payment-phone">
                Numéro Airtel Money pour le paiement
              </label>
              <input
                id="subscription-payment-phone"
                type="tel"
                value={subscriptionPaymentPhone}
                onChange={event => setSubscriptionPaymentPhone(event.target.value)}
                placeholder="Ex. 05… ou +24205…"
                disabled={subscriptionPaymentPending}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-green-500"
              />
              <button
                onClick={activateSubscription}
                disabled={subscriptionPaymentPending}
                className="mt-4 w-full rounded-xl bg-green-600 px-3 py-3 text-sm font-black text-white hover:bg-green-700"
              >
                {subscriptionPaymentPending ? "Paiement en cours…" : isSubscriptionActive() ? "Réabonner" : "Payer l’abonnement mensuel"}
              </button>
              {!isSubscriptionActive() && (
                <p className="mt-2 text-xs text-amber-700">Votre accès est bloqué tant que l’abonnement n’est pas renouvelé.</p>
              )}
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex items-center gap-2 text-slate-700">
                <Sparkles size={16} />
                <p className="text-sm font-black">Résumé</p>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Sujets téléchargés</span>
                  <span className="font-black text-slate-900">{downloadedPaperIds.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Accès</span>
                  <span className="font-black text-slate-900">{isSubscriptionActive() ? "Illimité" : "Bloqué"}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
