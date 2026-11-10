import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from "react";

import { TEXTS } from "./texts.ts";
import { detectLanguage, isLanguage, translate, type Language } from "./translate.ts";

const STORAGE_KEY = "breaker.language";

type Value = {
  language: Language;
  toggleLanguage: (next: Language) => void;
  t: (key: string, vars?: Readonly<Record<string, string | number>>) => string;
};

const Context = createContext<Value | null>(null);

function readStored(): Language | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isLanguage(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => readStored() ?? detectLanguage());

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const toggleLanguage = useCallback((next: Language) => {
    setLanguage(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      void 0;
    }
  }, []);

  const value = useMemo<Value>(
    () => ({
      language,
      toggleLanguage,
      t: (key, vars) => translate(TEXTS, language, key, vars),
    }),
    [language, toggleLanguage],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLanguage(): Value {
  const value = useContext(Context);
  if (!value) {
    throw new Error("useLanguage() was called outside <LanguageProvider>");
  }
  return value;
}
