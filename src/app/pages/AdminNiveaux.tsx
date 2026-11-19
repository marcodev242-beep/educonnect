import React, { useEffect, useState } from "react";

export default function AdminNiveaux({ onBack, setView }: { onBack: () => void; setView?: (v: string) => void }) {
  const [niveaux, setNiveaux] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchNiveaux = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/niveaux')
      const data = await res.json()
      setNiveaux(data.niveaux || [])
    } catch (e) {
      console.error('Impossible de charger les niveaux', e)
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchNiveaux() }, [])

  const handleCreate = async () => {
    const nom = window.prompt('Nom du niveau (ex: 6ème)')
    if (!nom) return
    const cycle = window.prompt('Cycle (Collège / Lycée)', 'Collège') || 'Collège'
    try {
      const res = await fetch('/api/admin/niveaux', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom_classe: nom, cycle }) })
      if (!res.ok) throw await res.json()
      await fetchNiveaux()
      alert('Niveau créé')
    } catch (e: any) { alert(e?.error || 'Erreur') }
  }

  const handleEdit = async (id: string, currentName: string, currentCycle: string) => {
    const nom = window.prompt('Nom du niveau', currentName)
    if (!nom) return
    const cycle = window.prompt('Cycle', currentCycle) || currentCycle
    try {
      const res = await fetch(`/api/admin/niveaux/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom_classe: nom, cycle }) })
      if (!res.ok) throw await res.json()
      await fetchNiveaux()
      alert('Modifié')
    } catch (e: any) { alert(e?.error || 'Erreur') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce niveau ?')) return
    try {
      const res = await fetch(`/api/admin/niveaux/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw await res.json()
      await fetchNiveaux()
      alert('Supprimé')
    } catch (e: any) { alert(e?.error || 'Erreur') }
  }

  const handleManage = (id: string) => {
    try {
      localStorage.setItem('educonnect-admin-current-niveau', id)
      if (setView) setView('admin-niveau-matieres')
    } catch (e) {}
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black">Niveaux</h1>
          <div className="flex gap-2">
            <button onClick={() => onBack()} className="px-3 py-2 rounded-xl border">Retour</button>
            <button onClick={handleCreate} className="px-3 py-2 rounded-xl bg-green-600 text-white">+ Ajouter un niveau</button>
          </div>
        </div>

        <div className="surface-card p-4">
          {loading ? <p>Chargement...</p> : (
            <>
              {niveaux.length === 0 ? (
                <div>
                  <p className="text-sm text-slate-500">Aucun niveau trouvé.</p>
                  <pre className="mt-3 text-xs text-slate-400 bg-slate-50 p-2 rounded">{JSON.stringify(niveaux, null, 2)}</pre>
                </div>
              ) : (
                <table className="w-full table-auto">
                  <thead>
                    <tr>
                      <th className="text-left">Niveau</th>
                      <th className="text-left">Nombre de matières</th>
                      <th className="text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {niveaux.map(n => (
                      <tr key={n.id_classe} className="border-t">
                        <td className="py-2">{n.nom_classe}</td>
                        <td className="py-2">{n.matieres_count || 0}</td>
                        <td className="py-2">
                          <button onClick={() => handleManage(n.id_classe)} className="mr-2 px-2 py-1 rounded border">Gérer</button>
                          <button onClick={() => handleEdit(n.id_classe, n.nom_classe, n.cycle)} className="mr-2 px-2 py-1 rounded border">Modifier</button>
                          <button onClick={() => handleDelete(n.id_classe)} className="px-2 py-1 rounded border text-red-600">Supprimer</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
