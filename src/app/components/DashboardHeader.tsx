
import React from "react";
import { Bell, Home, LogOut, BookOpen } from "lucide-react";
import { UserRole } from "../types";

const badgeColors: Record<UserRole, string> = {
  student: "bg-emerald-100 text-emerald-900",
  teacher: "bg-amber-100 text-amber-900",
  school: "bg-teal-100 text-teal-900",
  admin: "bg-slate-200 text-slate-800",
};

const labels: Record<UserRole, string> = {
  student: "Élève",
  teacher: "Enseignant",
  school: "École",
  admin: "Administrateur",
};

interface DashboardHeaderProps {
  role: UserRole;
  name: string;
  onLogout: () => void;
  onFeed?: () => void;
  onTeacherSubjects?: () => void;
  onTeacherExams?: () => void;
  onExamCatalog?: () => void;
}

export function DashboardHeader({
  role,
  name,
  onLogout,
  onFeed,
  onTeacherSubjects,
  onTeacherExams,
  onExamCatalog,
}: DashboardHeaderProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="app-header sticky top-0 z-30">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-4">

        <div className="flex items-center gap-2">
          <div className="brand-mark h-10 w-10 overflow-hidden sm:h-11 sm:w-11">
            <img
              src="/logo.png"
              alt="EduConnect Congo"
              className="w-full h-full object-cover"
            />
          </div>

          <span className="font-black text-slate-900 text-sm hidden sm:block">
            EduConnect Congo
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">

          <button
            type="button"
            onClick={onFeed}
            title="Accueil"
            aria-label="Accueil"
            className="primary-button inline-flex shrink-0 items-center gap-2 px-2.5 py-2 text-xs font-black sm:px-3"
          >
            <Home size={14} />
            <span className="hidden sm:inline">Accueil</span>
          </button>

          {role === "teacher" && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (onTeacherSubjects) {
                    onTeacherSubjects();
                  } else {
                    console.error("Navigation vers les sujets non transmise.");
                  }
                }}
                title="Gestion des sujets"
                aria-label="Gestion des sujets"
                className="primary-button inline-flex shrink-0 items-center gap-2 px-2.5 py-2 text-xs font-black sm:px-3"
              >
                <BookOpen size={14} />
                <span className="hidden sm:inline">Gestion des sujets</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  console.log("Navigation examens :", typeof onTeacherExams);

                  if (onTeacherExams) {
                    onTeacherExams();
                  } else {
                    console.error(
                      "La fonction onTeacherExams n'a pas été transmise depuis TeacherDashboard."
                    );
                  }
                }}
                title="Examens en ligne"
                aria-label="Examens en ligne"
                className="primary-button inline-flex shrink-0 items-center gap-2 px-2.5 py-2 text-xs font-black sm:px-3"
              >
                <BookOpen size={14} />
                <span className="hidden sm:inline">Examens en ligne</span>
              </button>
            </>
          )}

          {role === "student" && (
            <button
              type="button"
              onClick={onExamCatalog || onFeed}
              title="Examens en ligne"
              aria-label="Examens en ligne"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-emerald-700 px-3 py-2 text-xs font-black text-white shadow-md shadow-emerald-900/15 transition hover:bg-emerald-800 sm:px-4"
            >
              <BookOpen size={15} />
              <span>Examens en ligne</span>
            </button>
          )}

          <button
            type="button"
            className="p-2 rounded-full hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors"
          >
            <Bell size={15} />
          </button>

          <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-bold sm:inline ${badgeColors[role]}`}>
            {labels[role]}
          </span>

          <div className="hidden sm:flex flex-col items-center leading-tight">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-[11px] font-black text-white">
              {initials}
            </div>

            <span className="mt-0.5 max-w-[120px] truncate text-[10px] font-bold text-slate-600">
              {name}
            </span>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-300 hover:text-red-400 transition-colors"
          >
            <LogOut size={15} />
          </button>

        </div>
      </div>
    </header>
  );
}
