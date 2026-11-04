import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { signOut as authSignOut } from "@/lib/auth";
import type { ErrorKey } from "@/lib/errors";
import { isRecoveryCallback, nextRecoveryFlag } from "@/lib/passwordReset";
import { supabase } from "@/lib/supabase";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  /**
   * True while the session comes from a password-reset link and the new
   * password has not been saved yet. The router keeps the user on the
   * new-password screen meanwhile.
   */
  isPasswordRecovery: boolean;
  signOut: () => Promise<{ error: ErrorKey | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Read the link synchronously too: Supabase only fires PASSWORD_RECOVERY
  // after the session is restored, and by then the splash could already be
  // sending the user to the dashboard.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() =>
    isRecoveryCallback(window.location.hash),
  );

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!isMounted) return;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      setIsPasswordRecovery((current) => nextRecoveryFlag(current, event));
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const result = await authSignOut();
    if (!result.error) {
      setSession(null);
      setUser(null);
      setIsPasswordRecovery(false);
    }
    return result;
  }, []);

  const value = useMemo(
    () => ({ session, user, isLoading, isPasswordRecovery, signOut }),
    [session, user, isLoading, isPasswordRecovery, signOut],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }

  return context;
}
