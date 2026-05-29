import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const initAuth = async () => {
      try {
        // Restore session from storage
        const { data: { session } } = await supabase.auth.getSession();
        // Debug: log session presence (do not log tokens in production)
        // eslint-disable-next-line no-console
        console.log('[AuthProvider] restored session:', !!session, session ? { userId: session.user?.id, expires_at: session.expires_at } : null);

        // If no session was returned, there might still be an authenticated user (depending on storage/persistence).
        // Try to read current user as a fallback and avoid redirect loops if the client stores only user info.
        if (!session) {
          try {
            const { data: userData, error: userErr } = await supabase.auth.getUser();
            if (!userErr && userData?.user) {
              // eslint-disable-next-line no-console
              console.log('[AuthProvider] fallback getUser found user:', { id: userData.user.id, email: userData.user.email });
              setUser(userData.user);
              // note: we don't have a full session object here, but treat presence of user as authenticated for routing purposes
              setSession((prev) => prev ?? null);
            }
          } catch (e) {
            // ignore
          }
        }
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);

          // Subscribe to auth state changes
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, newSession) => {
              if (mounted) {
                // eslint-disable-next-line no-console
                console.log('[AuthProvider] Auth state changed:', { event: _event, hasSession: !!newSession });
                setSession(newSession);
                setUser(newSession?.user ?? null);
              }
            }
          );

          unsubscribe = subscription.unsubscribe;
          setIsLoading(false);
        }
      } catch (error) {
        console.error('[AuthProvider] Auth initialization error:', error);
        if (mounted) {
          setSession(null);
          setUser(null);
          setIsLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    isAuthenticated: !!session || !!user,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return context;
}
