import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { DashboardHeader } from "../components/DashboardHeader";
import { ExamCard } from "../components/ExamCard";
import { Exam } from "../types";
import { apiUrl } from "../../lib/api";
import { toast } from "sonner";

export function ExamCatalogPage({
  onLogout,
  onFeed,
  onExamCatalog,
  user,
  onSelect,
}: {
  onLogout: () => void;
  onFeed: () => void;
  onExamCatalog?: () => void;
  user: { id: string; name: string; role: string };
  onSelect?: (exam: any) => void;
}) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMatiere, setFilterMatiere] = useState("");
  const [filterClasse, setFilterClasse] = useState("");
  const [filterEnseignant, setFilterEnseignant] = useState("");
  const [search, setSearch] = useState("");
  const [matieres, setMatieres] = useState<{ id_matiere: string; nom_matiere: string }[]>([]);
  const [classes, setClasses] = useState<{ id_classe: string; nom_classe: string }[]>([]);

  const fetchData = async () => {
    try {
      const [examsRes, catalogRes] = await Promise.all([
        fetch(apiUrl("/api/exams"), { credentials: "include" }),
        fetch(apiUrl("/api/catalog"), { credentials: "include" }),
      ]);
      const examsData = await examsRes.json();
      const catalogData = await catalogRes.json();
      setExams(examsData.exams || []);
      setMatieres(catalogData.subjects || []);
      setClasses(catalogData.classes || []);
    } catch (error) {
      console.error("Erreur chargement examens:", error);
      toast.error("Impossible de charger les examens");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      if (filterMatiere && exam.nom_matiere?.toLowerCase() !== filterMatiere.toLowerCase()) return false;
      if (filterClasse && exam.nom_classe?.toLowerCase() !== filterClasse.toLowerCase()) return false;
      if (filterEnseignant && exam.nom_enseignant?.toLowerCase() !== filterEnseignant.toLowerCase()) return false;
      if (search && exam.titre.toLowerCase().indexOf(search.toLowerCase()) === -1) return false;
      return true;
    });
  }, [exams, filterMatiere, filterClasse, filterEnseignant, search]);
  return (
    <div className="app-shell min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">
        <DashboardHeader role="student" name={user.name} onLogout={onLogout} onFeed={onFeed} onExamCatalog={onExamCatalog} />
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Catalogue des examens</h1>
            <p className="text-slate-600 mt-1">
              Parcourez les examens disponibles, choisissez celui qui vous intéresse et inscrivez-vous.
            </p>
          </div>
          <button
            onClick={onFeed}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft size={14} /> Retour accueil
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 mb-8 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-2">Recherche</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Titre de l'examen…"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-2">Matière</label>
              <select
                value={filterMatiere}
                onChange={(e) => setFilterMatiere(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 bg-white"
              >
                <option value="">Toutes</option>
                {matieres.map((m) => (
                  <option key={m.id_matiere} value={m.nom_matiere}>
                    {m.nom_matiere}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-2">Classe / Niveau</label>
              <select
                value={filterClasse}
                onChange={(e) => setFilterClasse(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 bg-white"
              >
                <option value="">Tous niveaux</option>
                {classes.map((c) => (
                  <option key={c.id_classe} value={c.nom_classe}>
                    {c.nom_classe}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearch("");
                  setFilterMatiere("");
                  setFilterClasse("");
                  setFilterEnseignant("");
                }}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 p-16 text-center">
            <p className="text-sm text-slate-500">Chargement des examens…</p>
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 p-16 text-center">
            <p className="text-sm font-bold text-slate-700">Aucun examen trouvé</p>
            <p className="mt-2 text-xs text-slate-500">Essayez de modifier vos filtres de recherche.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredExams.map((exam) => (
              <ExamCard
                key={exam.id_examen}
                exam={exam}
                onSelect={(e) => {
                  onSelect?.(e);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
