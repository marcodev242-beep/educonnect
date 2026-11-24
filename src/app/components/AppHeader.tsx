import React from "react";
import { LogIn, Search, ShoppingCart, UserPlus, BookOpen } from "lucide-react";
import { AuthMode, AuthUser, UserRole, View } from "../types";
import { InstallAppButton } from "./InstallAppButton";

const roleLabels: Record<UserRole, string> = {
  student: "Grand public",
  teacher: "Enseignant",
  school: "Ecole",
  admin: "Administrateur",
};

const roleViews: Record<UserRole, View> = {
  student: "student",
  teacher: "teacher",
  school: "school",
  admin: "admin",
};

export function AppHeader({
  search,
  setSearch,
  loggedInAs,
  authUser,
  setView,
  onOpenAuth,
  onOpenExams,
  cartCount = 0,
  onOpenCart,
}: {
  search: string;
  setSearch: (value: string) => void;
  loggedInAs: UserRole | null;
  authUser: AuthUser | null;
  setView: (view: View) => void;
  onOpenAuth: (mode: AuthMode) => void;
  onOpenExams?: () => void;
  cartCount?: number;
  onOpenCart?: () => void;
}) {
  const goToExams = () => {
    if (loggedInAs === "student") {
      setView("student-exams");
    } else if (loggedInAs === "teacher") {
      setView("teacher-exams");
    } else {
      setView("feed");
    }
  };
  const dashboardView = loggedInAs ? roleViews[loggedInAs] : null;
  const initials = authUser?.name
    .split(" ")
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="app-header sticky top-0 z-40">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 h-[62px] sm:h-[72px] flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setView("home")}
          className="flex items-center gap-2 min-w-0 hover:opacity-85 transition-opacity"
        >
          <div className="brand-mark w-10 h-10 sm:w-12 sm:h-12 overflow-hidden flex-shrink-0">
            <img src="/logo.png" alt="EduConnect Congo" className="w-full h-full object-cover" />
          </div>
          <div className="hidden sm:block text-left min-w-0">
            <p className="font-black text-slate-950 text-base leading-tight truncate">EduConnect Congo</p>
            <p className="text-[11px] text-slate-500 font-bold">Sujets scolaires publies</p>
          </div>
        </button>

        <div className="flex-1 max-w-xl mx-auto min-w-0">
          <label className="header-search">
            <Search size={16} className="text-green-600 flex-shrink-0" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Rechercher..."
              className="w-full bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-300"
            />
          </label>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <InstallAppButton />
          {authUser && dashboardView ? (
            <>
              <button
                type="button"
                onClick={onOpenCart}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-green-400 hover:text-green-700"
                title="Panier"
              >
                <ShoppingCart size={16} />
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-black text-white">
                    {cartCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={goToExams}
                className="relative inline-flex h-10 items-center justify-center gap-2 rounded-full bg-emerald-700 px-3 text-white shadow-md shadow-emerald-900/15 transition hover:bg-emerald-800 sm:px-4"
                title="Examens en ligne"
              >
                <BookOpen size={16} />
                <span className="text-xs font-black">Examens en ligne</span>
              </button>
              <button
                type="button"
                onClick={() => setView(dashboardView)}
                className="hidden sm:flex flex-col items-center gap-0.5 rounded-2xl bg-slate-950 px-3 py-1.5 text-white hover:bg-green-700 transition-colors shadow-lg shadow-slate-900/10"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-[11px] font-black">{initials}</span>
                <span className="max-w-[110px] truncate text-[10px] font-bold leading-none">{authUser.name}</span>
              </button>
              <button
                type="button"
                onClick={() => setView(dashboardView)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-[11px] font-black text-white hover:bg-green-700 transition-colors sm:hidden"
                title={roleLabels[authUser.role]}
              >
                {initials}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onOpenExams || (() => onOpenAuth("login"))} className="inline-flex h-10 items-center gap-2 rounded-full bg-emerald-700 px-3 text-xs font-black text-white shadow-md shadow-emerald-900/15 transition hover:bg-emerald-800 sm:px-4"><BookOpen size={15} /><span>Examens en ligne</span></button>
              <button
                type="button"
                onClick={() => onOpenAuth("login")}
                className="primary-button flex items-center gap-1.5 text-[11px] sm:text-xs font-black px-3 py-2 sm:px-4 sm:py-2.5"
              >
                <LogIn size={13} />
                <span className="hidden sm:inline">Connexion</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth("register")}
                className="hidden sm:flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 shadow-sm transition-colors hover:border-green-400 hover:text-green-700"
              >
                <UserPlus size={13} />
                Inscription
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
