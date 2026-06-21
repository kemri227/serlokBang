import React, { useState } from "react";
import { BusFront, CheckCircle, Loader2, LogIn, MapPin, ShieldCheck } from "lucide-react";
import { useAuth } from "./AuthContext";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { configured, loading, session, profile, error, signInWithGoogle, completeOnboarding } = useAuth();
  const [choice, setChoice] = useState<"passenger" | "driver" | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!configured) {
    return (
      <AuthShell>
        <ShieldCheck size={38} className="text-amber-500" />
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Konfigurasi Supabase diperlukan</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md">
          Isi <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> di file environment, lalu jalankan migrasi database.
        </p>
      </AuthShell>
    );
  }

  if (loading) {
    return <AuthShell><Loader2 size={40} className="animate-spin text-emerald-600" /><p>Menyiapkan akun…</p></AuthShell>;
  }

  if (!session) {
    return (
      <AuthShell>
        <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xl"><MapPin size={30} /></div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">AngkotTrack</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300 mt-2">Masuk untuk berbagi dan melihat angkot di sekitar Anda.</p>
        </div>
        <button onClick={signInWithGoogle} className="px-6 py-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold shadow-lg flex items-center gap-3 hover:-translate-y-0.5 transition-transform">
          <LogIn size={19} /> Masuk dengan Google
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </AuthShell>
    );
  }

  if (!profile?.onboarding_complete) {
    const submit = async () => {
      if (!choice || (choice === "driver" && whatsapp.replace(/\D/g, "").length < 9)) return;
      setSubmitting(true);
      try { await completeOnboarding(choice, whatsapp); } finally { setSubmitting(false); }
    };
    return (
      <AuthShell>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Kamu menggunakan AngkotTrack sebagai?</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300 mt-2">Pilihan supir akan diperiksa admin terlebih dahulu.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 w-full max-w-md">
          <button onClick={() => setChoice("passenger")} className={`p-5 rounded-2xl border text-left transition-all ${choice === "passenger" ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}>
            <MapPin className="mb-3" /><strong>Penumpang</strong><span className="block text-xs opacity-75 mt-1">Langsung masuk</span>
          </button>
          <button onClick={() => setChoice("driver")} className={`p-5 rounded-2xl border text-left transition-all ${choice === "driver" ? "bg-blue-600 border-blue-600 text-white" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}>
            <BusFront className="mb-3" /><strong>Supir</strong><span className="block text-xs opacity-75 mt-1">Perlu persetujuan</span>
          </button>
        </div>
        {choice === "driver" && (
          <label className="w-full max-w-md text-left text-sm font-bold text-slate-700 dark:text-slate-200">
            Nomor WhatsApp
            <input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} inputMode="tel" placeholder="Contoh: 081234567890" className="mt-2 w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        )}
        <button disabled={!choice || submitting || (choice === "driver" && whatsapp.replace(/\D/g, "").length < 9)} onClick={submit} className="px-7 py-3.5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black disabled:opacity-40 flex items-center gap-2">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />} Lanjutkan
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </AuthShell>
    );
  }

  return <>{children}</>;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center text-center gap-6 p-6">{children}</main>;
}
