import React, { useEffect, useState } from "react";

export default function AdminNiveauMatieres({ onBack }: { onBack: () => void; setView?: (v: string) => void }) {
  const [niveauId, setNiveauId] = useState<string | null>(null)
  const [matieres, setMatieres] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [newMatiereName, setNewMatiereName] = useState('')

  useEffect(() => {
    const n = localStorage.getItem('educonnect-admin-current-niveau')
    const m = localStorage.getItem('educonnect-admin-current-matiere')
    if (n) setNiveauId(n)
    // If navigated from matiere manage, open that matiere as selected
    if (m) {
      // try to find matiere after load
    }
  }, [])

  const fetchData = async () => {
    if (!niveauId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/niveaux/${encodeURIComponent(niveauId)}/matieres`)
      const data = await res.json()
      setMatieres(data.matieres || [])
      setSelected(new Set((data.selectedIds || []).map(String)))
    } catch (e) { console.error('Impossible', e) } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [niveauId])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(matieres.map(m => String(m.id_matiere))))
  const deselectAll = () => setSelected(new Set())

  const handleCreateMatiere = async () => {
    const nom = newMatiereName.trim()
    if (!nom || !niveauId) return
    try {
      const res = await fetch('/api/admin/matieres', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom_matiere: nom }) })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || 'Impossible de creer la matiere')
      }
      // reload list and auto-select the newly created matiere (we'll fetch by name)
      await fetchData()
      const created = matieres.find(m => String(m.nom_matiere).toLowerCase() === nom.toLowerCase())
      if (created) setSelected(prev => new Set(prev).add(String(created.id_matiere)))
      setNewMatiereName('')
    } catch (e: any) { alert(e?.message || 'Erreur') }
  }

  const handleSave = async () => {
    if (!niveauId) return
    try {
      const res = await fetch(`/api/admin/niveaux/${encodeURIComponent(niveauId)}/matieres`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matiereIds: Array.from(selected) }) })
      if (!res.ok) throw await res.json()
      alert('Enregistré')
      // clear temp storage
      localStorage.removeItem('educonnect-admin-current-niveau')
    } catch (e: any) { alert(e?.error || 'Erreur') }
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black">Matières du niveau</h1>
          <div className="flex gap-2">
            <button onClick={() => { localStorage.removeItem('educonnect-admin-current-niveau'); onBack(); }} className="px-3 py-2 rounded-xl border">Retour</button>
            <button onClick={handleSave} className="px-3 py-2 rounded-xl bg-green-600 text-white">Enregistrer</button>
          </div>
        </div>

        {!niveauId ? (
          <div className="surface-card p-4">Aucun niveau sélectionné.</div>
        ) : (
          <div className="surface-card p-4">
            <p className="text-sm mb-3">Niveau: <strong>{niveauId}</strong></p>
            {loading ? <p>Chargement...</p> : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input placeholder="Rechercher une matière..." value={filter} onChange={e => setFilter(e.target.value)} className="flex-1 border rounded px-3 py-2" />
                  <button onClick={selectAll} className="px-3 py-2 rounded border">Tout</button>
                  <button onClick={deselectAll} className="px-3 py-2 rounded border">Aucun</button>
                </div>

                <div className="grid gap-2">
                  {matieres.filter(m => !filter || String(m.nom_matiere).toLowerCase().includes(filter.toLowerCase())).map(m => (
                    <label key={m.id_matiere} className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={selected.has(String(m.id_matiere))} onChange={() => toggle(String(m.id_matiere))} />
                      <span>{m.nom_matiere}</span>
                    </label>
                  ))}
                </div>

                <div className="pt-2 border-t mt-2">
                  <p className="text-sm font-semibold mb-2">Créer une nouvelle matière</p>
                  <div className="flex gap-2">
                    <input placeholder="Nom de la matière" value={newMatiereName} onChange={e => setNewMatiereName(e.target.value)} className="flex-1 border rounded px-3 py-2" />
                    <button onClick={handleCreateMatiere} className="px-3 py-2 rounded bg-green-600 text-white">Créer</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
