import { Translation } from '@/translation/type';
import { createContext } from 'react';

type TranslationContextProps = {
  locale: Translation;
  /**
   * Optional setter that allows updating the active locale from the context.
   * The function accepts a locale key (e.g. 'eng' | 'ita') or null to reset.
   */
  setLocale?: (localeKey: string | null) => void;
};

export const TranslationContext = createContext<
  TranslationContextProps | undefined
>(undefined);
