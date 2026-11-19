import React, { useEffect, useState } from "react";

export default function AdminMatieres({ onBack, setView }: { onBack: () => void; setView?: (v: string) => void }) {
  const [matieres, setMatieres] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchMatieres = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/matieres')
      const data = await res.json()
      setMatieres(data.matieres || [])
    } catch (e) {
      console.error('Impossible de charger les matieres', e)
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchMatieres() }, [])

  const handleCreate = async () => {
    const nom = window.prompt('Nom de la matière')
    if (!nom) return
    try {
      const res = await fetch('/api/admin/matieres', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom_matiere: nom }) })
      if (!res.ok) throw await res.json()
      await fetchMatieres()
      alert('Matière créée')
    } catch (e: any) { alert(e?.error || 'Erreur') }
  }

  const handleEdit = async (id: string, currentName: string) => {
    const nom = window.prompt('Nom de la matière', currentName)
    if (!nom) return
    try {
      const res = await fetch(`/api/admin/matieres/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom_matiere: nom }) })
      if (!res.ok) throw await res.json()
      await fetchMatieres()
      alert('Modifié')
    } catch (e: any) { alert(e?.error || 'Erreur') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette matière ?')) return
    try {
      const res = await fetch(`/api/admin/matieres/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw await res.json()
      await fetchMatieres()
      alert('Supprimée')
    } catch (e: any) { alert(e?.error || 'Erreur') }
  }

  const handleManage = (id: string) => {
    try {
      localStorage.setItem('educonnect-admin-current-matiere', id)
      if (setView) setView('admin-niveau-matieres')
    } catch (e) {}
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black">Matières</h1>
          <div className="flex gap-2">
            <button onClick={() => onBack()} className="px-3 py-2 rounded-xl border">Retour</button>
            <button onClick={handleCreate} className="px-3 py-2 rounded-xl bg-green-600 text-white">+ Ajouter une matière</button>
          </div>
        </div>

        <div className="surface-card p-4">
          {loading ? <p>Chargement...</p> : (
            <table className="w-full table-auto">
              <thead>
                <tr>
                  <th className="text-left">Matière</th>
                  <th className="text-left">Niveaux associés</th>
                  <th className="text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matieres.map(m => (
                  <tr key={m.id_matiere} className="border-t">
                    <td className="py-2">{m.nom_matiere}</td>
                    <td className="py-2">{(m.classes || []).join(', ')}</td>
                    <td className="py-2">
                      <button onClick={() => handleManage(m.id_matiere)} className="mr-2 px-2 py-1 rounded border">Gérer niveaux</button>
                      <button onClick={() => handleEdit(m.id_matiere, m.nom_matiere)} className="mr-2 px-2 py-1 rounded border">Modifier</button>
                      <button onClick={() => handleDelete(m.id_matiere)} className="px-2 py-1 rounded border text-red-600">Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
