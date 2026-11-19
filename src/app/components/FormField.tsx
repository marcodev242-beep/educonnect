import React from "react";

export function FormField({
  label,
  icon,
  placeholder,
  value = "",
  onChange,
  type = "text",
}: {
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 block mb-1.5">{label}</label>
      <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2.5 focus-within:border-emerald-800 focus-within:ring-2 focus-within:ring-amber-100 bg-white transition-all">
        <span className="text-slate-300">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="flex-1 outline-none text-sm text-slate-800 placeholder:text-slate-300 bg-transparent"
        />
      </div>
    </div>
  );
}
