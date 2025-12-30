// context/CustomerAuthContext.js
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSupabase } from "../services/supabase";

const CustomerAuthContext = createContext(null);

export function CustomerAuthProvider({ children }) {
  const supabase = getSupabase();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!ignore) {
        setSession(data?.session || null);
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
    });

    return () => {
      ignore = true;
      sub?.subscription?.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo(
    () => ({
      loading,
      session,
      user: session?.user || null,
      isLoggedIn: !!session?.user,
    }),
    [loading, session]
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth must be used within CustomerAuthProvider");
  return ctx;
}
