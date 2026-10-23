import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { en, es, type MessageKey } from "./messages";

export type Language = "es" | "en";

export const LANGUAGES: readonly Language[] = ["es", "en"];

const STORAGE_KEY = "fitmarket.language";
const dictionaries: Record<Language, Record<MessageKey, string>> = { es, en };
const LOCALES: Record<Language, string> = { es: "es-CO", en: "en-US" };

export type TranslateParams = Record<string, string | number>;

function isLanguage(value: unknown): value is Language {
  return value === "es" || value === "en";
}

function readStoredLanguage(): Language | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

function detectLanguage(): Language {
  const stored = readStoredLanguage();

  if (stored) {
    return stored;
  }

  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

interface I18nContextValue {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
  formatCurrency: (value: number) => string;
  formatDate: (isoDate: string) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [language, setLanguageState] = useState<Language>(detectLanguage);

  const locale = LOCALES[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // A signed-in user's saved language wins, so it follows them across devices.
  const savedLanguage = user?.user_metadata?.language;

  useEffect(() => {
    if (!isLoading && isLanguage(savedLanguage)) {
      setLanguageState(savedLanguage);
    }
  }, [isLoading, savedLanguage]);

  const setLanguage = useCallback(
    (next: Language) => {
      setLanguageState(next);

      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage can be blocked (private mode); the choice still applies now.
      }

      if (user) {
        void supabase.auth.updateUser({ data: { language: next } });
      }
    },
    [user],
  );

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = dictionaries[language];

    return {
      language,
      locale,
      setLanguage,
      t: (key, params) => interpolate(dictionary[key] ?? key, params),
      formatCurrency: (amount) =>
        new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "COP",
          maximumFractionDigits: 0,
        }).format(amount),
      formatDate: (isoDate) => {
        const date = new Date(isoDate);

        return Number.isNaN(date.getTime())
          ? "—"
          : date.toLocaleDateString(locale, {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
      },
    };
  }, [language, locale, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);

  if (context === undefined) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}
