import { Translation } from '@/translation/type';
import { PropsWithChildren, useContext, useEffect, useState } from 'react';
import { TranslationContext } from './TranslationContext';
import { Leaves } from './types';
import get from 'lodash.get';

type tParam = Record<string, any>;

export const useText = <NS extends keyof Translation>(namespace: NS) => {
  const context = useContext(TranslationContext);

  const t = <K extends Leaves<Translation[NS]>>(key: K, param?: tParam) => {
    // If context is not available, return a fallback
    if (!context || !context.locale) {
      const keyStr = String(key);
      return keyStr.split('.').pop() || keyStr;
    }

    const a = context.locale[namespace];

    let translation = get(a, key, '') as string;
    if (param) {
      Object.keys(param).forEach((k) => {
        translation = translation.replace(/{.*}/g, param[k]);
      });
    }
    return translation;
  };

  return t;
};

type TranslationProviderProps = PropsWithChildren<{
  locale: any;
}>;

/**
 * TranslationProvider
 *
 * Behavior:
 * - Uses the `locale` prop as the initial server-side locale.
 * - On the client, if `localStorage.locale` is present, it will load that locale and override the initial one.
 * - Listens for `storage` events and a custom `localeChange` event so changes to the locale update the app live.
 *
 * Implementation detail:
 * - Exposes a `setLocale` function in context so consumers (e.g. settings page) can update the active locale directly.
 * - When the locale is changed we persist it to localStorage and dispatch a `localeChange` event to let other listeners react.
 */
const TranslationProvider = ({
  locale: initialLocale,
  children,
}: TranslationProviderProps) => {
  const [locale, setLocale] = useState<Translation | any>(initialLocale);
  const [localeKey, setLocaleKey] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('locale');
    }
    return null;
  });

  // Helper to load and apply a locale by key (null -> revert to initial)
  const applyLocale = async (key: string | null) => {
    if (typeof window === 'undefined') return;
    if (!key) {
      setLocale(initialLocale);
      setLocaleKey(null);
      return;
    }
    try {
      console.debug('TranslationProvider: applying locale', key);
      const mod = (await import(`@/translation/${key}`)).default;
      setLocale(mod);
      setLocaleKey(key);
      console.debug('TranslationProvider: applied locale', key);
    } catch (e) {
      console.error('TranslationProvider: failed to apply locale', key, e);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let mounted = true;

    // On mount prefer localStorage value if present
    const storedLocale = localStorage.getItem('locale');
    if (storedLocale) {
      // no await here; kick off and let applyLocale update state when ready
      applyLocale(storedLocale);
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'locale') {
        const newLocaleKey = e.newValue;
        console.info('[i18n] storage event locale ->', newLocaleKey);
        applyLocale(newLocaleKey);
      }
    };

    const handleLocaleChangeEvent = (e: Event) => {
      const custom = e as CustomEvent<string | null>;
      const key = custom?.detail ?? localStorage.getItem('locale');
      console.info('[i18n] localeChange event ->', key);
      applyLocale(key);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(
      'localeChange',
      handleLocaleChangeEvent as EventListener
    );

    return () => {
      mounted = false;
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(
        'localeChange',
        handleLocaleChangeEvent as EventListener
      );
    };
    // initialLocale is intentionally included so reverting to server locale works
  }, [initialLocale]);

  // Exposed setter function used by consumers (e.g. settings page)
  const updateLocaleFromContext = (key: string | null) => {
    try {
      if (key) {
        localStorage.setItem('locale', key);
      } else {
        localStorage.removeItem('locale');
      }
    } catch (e) {
      // ignore localStorage errors
    }

    // notify same-tab listeners immediately
    try {
      window.dispatchEvent(new CustomEvent('localeChange', { detail: key }));
    } catch (e) {
      // ignore
    }

    // apply locally as well
    applyLocale(key);
  };

  return (
    <TranslationContext.Provider
      value={{ locale, setLocale: updateLocaleFromContext }}
      key={localeKey ?? 'default'}
    >
      {children}
    </TranslationContext.Provider>
  );
};

export default TranslationProvider;
