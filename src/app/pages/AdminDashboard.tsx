import React, { useEffect, useState } from "react";
import { Building2, Check, X } from "lucide-react";
import { DashboardHeader } from "../components/DashboardHeader";
import { AuthUser, PendingSchool } from "../types";
import AdminCharts from "../components/AdminCharts";

const AdminDashboard: React.FC<{ onLogout: () => void; onFeed: () => void; user: AuthUser; onCatalogRefresh?: () => void; setView?: (v: string) => void }> = ({ onLogout, onFeed, user, onCatalogRefresh, setView }) => {
  const [schoolStatuses, setSchoolStatuses] = useState<Record<string, "approved" | "rejected" | null>>({});
  const [adminData, setAdminData] = useState<{ pendingSchools: PendingSchool[]; stats: { pendingSchools: number; verifiedSchools: number; activeTeachers: number; users: number }; topTeachers?: any[]; topPapers?: any[] }>({
    pendingSchools: [],
    stats: { pendingSchools: 0, verifiedSchools: 0, activeTeachers: 0, users: 0 },
    topTeachers: [],
    topPapers: [],
  });
  const [verifiedSchools, setVerifiedSchools] = useState<any[]>([]);
  const [allSchools, setAllSchools] = useState<any[] | null>(null);
  const [showAllSchools, setShowAllSchools] = useState(false);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [withdrawalError, setWithdrawalError] = useState('');

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then(res => res.json())
      .then(setAdminData)
      .catch(error => console.error('Impossible de charger le tableau admin', error));

    // also load verified schools from catalog
    fetch('/api/catalog')
      .then(res => res.json())
      .then(data => setVerifiedSchools(data.schools || []))
      .catch(err => console.error('Impossible de charger les ecoles validees', err));
    fetch('/api/admin/teacher-withdrawals')
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Erreur de chargement'); setWithdrawals(data.withdrawals || []); })
      .catch(error => setWithdrawalError(error instanceof Error ? error.message : 'Impossible de charger les retraits'));
  }, []);

  const processWithdrawal = async (withdrawal: any, status: 'PAYE' | 'REJETE') => {
    const reason = status === 'REJETE' ? window.prompt('Motif du rejet (le solde sera rendu à l’enseignant)')?.trim() : '';
    if (status === 'REJETE' && !reason) return;
    if (status === 'PAYE' && !window.confirm(`Confirmer que le paiement Mobile Money de ${Number(withdrawal.montant).toLocaleString('fr-FR')} FCFA a été effectué au ${withdrawal.numero_mobile} ?`)) return;
    try {
      const response = await fetch(`/api/admin/teacher-withdrawals/${encodeURIComponent(withdrawal.id_retrait)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de traiter la demande');
      setWithdrawals(current => current.map(item => item.id_retrait === withdrawal.id_retrait ? { ...item, ...data.withdrawal } : item));
      setWithdrawalError('');
    } catch (error) {
      setWithdrawalError(error instanceof Error ? error.message : 'Erreur inattendue');
    }
  };

  const fetchAllSchools = async () => {
    try {
      const res = await fetch('/api/admin/schools')
      if (!res.ok) throw new Error('Impossible de charger')
      const data = await res.json()
      setAllSchools(data.schools || [])
      setShowAllSchools(true)
    } catch (e) {
      console.error('Impossible de charger toutes les ecoles', e)
    }
  }

  const approveSchool = async (schoolId: string, action: 'approved' | 'rejected') => {
    try {
      const res = await fetch('/api/admin/school-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId, action }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      const data = await res.json();
      setSchoolStatuses(prev => ({ ...prev, [schoolId]: action }));
      // If response contains updated admin payload, replace it
      if (data && data.stats) {
        setAdminData(prev => ({ ...prev, pendingSchools: data.pendingSchools || [], stats: data.stats, topTeachers: data.topTeachers || [], topPapers: data.topPapers || [] } as any));
      }

      // refresh verified schools list and main catalog counts
      try {
        const cat = await fetch('/api/catalog');
        if (cat.ok) {
          const cdata = await cat.json();
          setVerifiedSchools(cdata.schools || []);
          if (onCatalogRefresh) onCatalogRefresh();
        }
      } catch (_) {}
    } catch (error) {
      console.error('Impossible de valider l etablissement', error);
    }
  };

  const stats = [
    { label: "Ecoles en attente", value: adminData.stats.pendingSchools.toString(), color: "text-orange-500", bg: "bg-orange-50" },
    { label: "Ecoles validees", value: adminData.stats.verifiedSchools.toString(), color: "text-green-600", bg: "bg-green-50" },
    { label: "Enseignants actifs", value: adminData.stats.activeTeachers.toString(), color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Utilisateurs total", value: adminData.stats.users.toString(), color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="app-shell min-h-screen">
      <DashboardHeader role="admin" name={user.name} onLogout={onLogout} onFeed={onFeed} />
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">
        <div className="mb-4 flex gap-2">
          <button onClick={() => setView && setView('admin-niveaux')} className="rounded-xl bg-green-600 text-white px-3 py-2 font-bold">Gérer les niveaux</button>
          <button onClick={() => setView && setView('admin-matieres')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold">Gérer les matières</button>
        </div>
        <section className="mb-6 rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-sm font-black text-slate-800">Retraits des enseignants</h2><p className="mt-0.5 text-xs text-slate-500">Effectuez le transfert Mobile Money, puis confirmez le paiement ici.</p></div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{withdrawals.filter(item => item.statut === 'EN_ATTENTE').length} en attente</span>
          </div>
          {withdrawalError && <p role="alert" className="mb-3 text-xs font-semibold text-red-600">{withdrawalError}</p>}
          {withdrawals.length === 0 ? <p className="text-sm text-slate-400">Aucune demande de retrait.</p> : <div className="divide-y divide-slate-100">
            {withdrawals.map(item => <div key={item.id_retrait} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-bold text-slate-700">{item.prenom} {item.nom} · {Number(item.montant).toLocaleString('fr-FR')} FCFA</p><p className="text-xs text-slate-500">{item.numero_mobile} · {new Date(item.date_demande).toLocaleString('fr-FR')}</p>{item.motif_rejet && <p className="text-xs text-red-600">Motif : {item.motif_rejet}</p>}</div>
              <div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.statut === 'PAYE' ? 'bg-emerald-50 text-emerald-700' : item.statut === 'REJETE' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{item.statut === 'PAYE' ? 'Payé' : item.statut === 'REJETE' ? 'Rejeté' : 'En attente'}</span>{item.statut === 'EN_ATTENTE' && <><button onClick={() => processWithdrawal(item, 'PAYE')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Confirmer payé</button><button onClick={() => processWithdrawal(item, 'REJETE')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50">Rejeter</button></>}</div>
            </div>)}
          </div>}
        </section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-4`}>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Écoles en attente de vérification d'agrément
            </h2>
            <div className="space-y-3">
              {adminData.pendingSchools.map((s, i) => (
                <div key={s.id} className="bg-white/85 rounded-2xl p-4 border border-white/70 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Building2 size={18} className="text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.city} · Inscrit le {s.date}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <code className="text-xs bg-slate-50 border border-slate-100 px-2 py-0.5 rounded font-mono text-slate-600">{s.agrement}</code>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{s.phone}</p>
                    </div>
                    {!schoolStatuses[s.id] ? (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => approveSchool(s.id, 'approved')}
                          className="flex items-center gap-1.5 bg-green-50 hover:bg-green-100 text-green-700 font-bold text-xs px-3 py-2 rounded-full transition-colors"
                        >
                          <Check size={11} /> Valider
                        </button>
                        <button
                          onClick={() => approveSchool(s.id, 'rejected')}
                          className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs px-3 py-2 rounded-full transition-colors"
                        >
                          <X size={11} /> Rejeter
                        </button>
                      </div>
                    ) : (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${schoolStatuses[s.id] === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {schoolStatuses[s.id] === "approved" ? "Validée ✓" : "Rejetée"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <AdminCharts topTeachers={adminData.topTeachers || []} topPapers={adminData.topPapers || []} />
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-6 mb-3">Écoles validées</h2>
            <div className="bg-white/85 rounded-2xl border border-white/70 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex items-center justify-between mb-3">
                <div />
                <div>
                  <button onClick={() => { if (!allSchools) fetchAllSchools(); else setShowAllSchools(!showAllSchools); }} className="text-sm font-semibold text-green-600">
                    {showAllSchools ? 'Masquer toutes les écoles' : 'Voir toutes les écoles'}
                  </button>
                </div>
              </div>
              {showAllSchools && allSchools && (
                <div className="mb-4">
                  {allSchools.map(s => (
                    <div key={s.id_etablissement || s.email_officiel} className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold">{s.nom_etablissement}</p>
                        <p className="text-xs text-slate-400">{s.email_officiel} · {s.ville}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">{s.est_verifie ? 'Validée' : 'En attente'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {verifiedSchools.length === 0 ? (
                <p className="text-xs text-slate-400">Aucune école validée pour le moment.</p>
              ) : (
                verifiedSchools.map(s => (
                  <div key={s.id_etablissement || s.id} className="flex items-center justify-between mb-3 last:mb-0">
                    <div>
                      <p className="text-sm font-semibold">{s.nom_etablissement || s.name}</p>
                      <p className="text-xs text-slate-400">{s.ville || s.city}</p>
                    </div>
                    <div>
                      <button onClick={() => approveSchool(s.id_etablissement || s.id, 'rejected')} className="text-sm font-bold text-red-600">Révoquer</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default AdminDashboard;
