import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export type AppRole = "passenger" | "driver" | "admin";
export type DriverStatus = "none" | "pending" | "approved" | "rejected";

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  whatsapp: string | null;
  role: AppRole;
  requested_role: "passenger" | "driver" | null;
  driver_status: DriverStatus;
  onboarding_complete: boolean;
}

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: (choice: "passenger" | "driver", whatsapp?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId?: string) => {
    if (!supabase || !userId) {
      setProfile(null);
      return;
    }
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,full_name,avatar_url,whatsapp,role,requested_role,driver_status,onboarding_complete")
      .eq("id", userId)
      .single();
    if (profileError) throw profileError;
    setProfile(data as UserProfile);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user.id);
  }, [loadProfile, session?.user.id]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      try {
        await loadProfile(data.session?.user.id);
      } catch (profileError) {
        setError(profileError instanceof Error ? profileError.message : "Gagal memuat profil.");
      } finally {
        if (active) setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      window.setTimeout(() => {
        loadProfile(nextSession.user.id)
          .catch((profileError) => setError(profileError instanceof Error ? profileError.message : "Gagal memuat profil."))
          .finally(() => setLoading(false));
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!session?.user.id) return;
    const interval = window.setInterval(() => {
      loadProfile(session.user.id).catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [loadProfile, session?.user.id]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { error: loginError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (loginError) {
      setError(loginError.message);
      throw loginError;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  }, []);

  const completeOnboarding = useCallback(async (choice: "passenger" | "driver", whatsapp?: string) => {
    if (!supabase) return;
    setError(null);
    const { error: onboardingError } = await supabase.rpc("complete_onboarding", {
      choice,
      phone: whatsapp || null,
    });
    if (onboardingError) {
      setError(onboardingError.message);
      throw onboardingError;
    }
    await loadProfile(session?.user.id);
  }, [loadProfile, session?.user.id]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    loading,
    session,
    user: session?.user || null,
    profile,
    error,
    signInWithGoogle,
    signOut,
    completeOnboarding,
    refreshProfile,
  }), [loading, session, profile, error, signInWithGoogle, signOut, completeOnboarding, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
