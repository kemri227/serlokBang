import React, { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Phone, UserCheck, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { UserProfile } from "../auth/AuthContext";

export default function AdminDriverApprovals() {
  const [requests, setRequests] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,avatar_url,whatsapp,role,requested_role,driver_status,onboarding_complete")
      .eq("requested_role", "driver")
      .eq("driver_status", "pending")
      .order("created_at", { ascending: true });
    if (!error) setRequests((data || []) as UserProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const decide = async (id: string, approve: boolean) => {
    if (!supabase) return;
    setProcessing(id);
    const { error } = await supabase.rpc("approve_driver", {
      target_user: id,
      approve,
      admin_reason: approve ? "Pendaftaran supir disetujui" : "Pendaftaran supir ditolak",
    });
    if (error) alert(error.message);
    await load();
    setProcessing(null);
  };

  return (
    <section className="rounded-3xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-2"><UserCheck size={15} /> Persetujuan Supir</h4>
        <span className="text-[10px] font-black bg-blue-600 text-white rounded-full px-2 py-0.5">{requests.length}</span>
      </div>
      {loading ? <Loader2 size={18} className="animate-spin mx-auto text-blue-600" /> : requests.length === 0 ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center py-3">Tidak ada permintaan baru.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => (
            <div key={request.id} className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-700 rounded-2xl p-3">
              <div className="font-black text-xs text-slate-800 dark:text-white">{request.full_name || request.email}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1"><Phone size={10} /> {request.whatsapp}</div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button disabled={processing === request.id} onClick={() => decide(request.id, true)} className="py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center gap-1 disabled:opacity-50"><Check size={12} /> Setujui</button>
                <button disabled={processing === request.id} onClick={() => decide(request.id, false)} className="py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-[10px] font-black flex items-center justify-center gap-1 disabled:opacity-50"><X size={12} /> Tolak</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
