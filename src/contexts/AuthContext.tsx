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
import {
  browserSessionStorage,
  type SignOutScope,
  initialRecoveryFlag,
  nextRecoveryFlag,
  writeRecoveryFlag,
} from "@/lib/passwordReset";
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
  /** Default scope is global; pass `{ scope: "local" }` for this device only. */
  signOut: (options?: {
    scope?: SignOutScope;
  }) => Promise<{ error: ErrorKey | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Read the link synchronously too: Supabase only fires PASSWORD_RECOVERY
  // after the session is restored, and by then the splash could already be
  // sending the user to the dashboard. The flag is also kept in
  // sessionStorage, because after a reload the hash is gone but the recovery
  // session is still there.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() =>
    initialRecoveryFlag(window.location.hash, browserSessionStorage()),
  );

  useEffect(() => {
    writeRecoveryFlag(browserSessionStorage(), isPasswordRecovery);
  }, [isPasswordRecovery]);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!isMounted) return;
      if (!initialSession) setIsPasswordRecovery(false);
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      setIsPasswordRecovery((current) =>
        nextRecoveryFlag(current, event, nextSession !== null),
      );
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async (options?: { scope?: SignOutScope }) => {
    const result = await authSignOut(options);
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
