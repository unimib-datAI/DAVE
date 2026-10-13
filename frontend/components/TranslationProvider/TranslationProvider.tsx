import { Translation } from '@/translation/type';
import {
  Fragment,
  PropsWithChildren,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { TranslationContext } from './TranslationContext';
import { Leaves } from './types';
import get from 'lodash.get';

type tParam = Record<string, any>;

const interpolate = (str: string, params?: tParam) =>
  params
    ? str.replace(/\{(\w+)\}/g, (match, name) =>
        name in params ? String(params[name]) : match
      )
    : str;

type RichParam = ReactNode | ((chunks: ReactNode) => ReactNode);

const defaultTags: Record<string, RichParam> = {
  strong: (chunks) => <strong>{chunks}</strong>,
  b: (chunks) => <b>{chunks}</b>,
  em: (chunks) => <em>{chunks}</em>,
  i: (chunks) => <i>{chunks}</i>,
};

const renderRich = (
  str: string,
  params: Record<string, RichParam>
): ReactNode[] => {
  // matches either <tag>...</tag> or {placeholder}
  const re = /<(\w+)>([\s\S]*?)<\/\1>|\{(\w+)\}/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(str))) {
    const [full, tag, inner, name] = m;
    if (m.index > last) out.push(str.slice(last, m.index));

    if (tag) {
      const render = params[tag];
      out.push(
        typeof render === 'function' ? (
          <Fragment key={m.index}>{render(renderRich(inner, params))}</Fragment>
        ) : (
          full // unknown tag stays visible
        )
      );
    } else if (name in params) {
      out.push(<Fragment key={m.index}>{params[name] as ReactNode}</Fragment>);
    } else {
      out.push(full); // unknown placeholder stays visible
    }
    last = m.index + full.length;
  }

  if (last < str.length) out.push(str.slice(last));
  return out;
};

export const useText = <NS extends keyof Translation>(namespace: NS) => {
  const context = useContext(TranslationContext);

  /**
   * This function retrieves a translation string for the given key and namespace, and optionally replaces placeholders in the string with provided parameters.
   * @param key The key that corresponds to the translation string in the locale file.
   * @param param An optional object where the keys correspond to the placeholders in the translation string, and the values are the values to replace them with.
   * @returns The translated string with placeholders replaced by the provided parameters, or the key itself if no translation is found.
   * @example t('greeting', {name: 'World'}) // returns "Hello World" if the translation string is "Hello {name}"
   */
  const t = <K extends Leaves<Translation[NS]>>(key: K, param?: tParam) => {
    if (!context || !context.locale) {
      const keyStr = String(key);
      return keyStr.split('.').pop() || keyStr;
    }

    const translation = get(context.locale[namespace], key, '') as string;
    return interpolate(translation, param);
  };

  /**
   * This allows for rendering strings with HTML tags directly embedded in the translation string, e.g. "Hello <strong>world</strong>". It also allows for placeholders to be replaced with React components, e.g. "Hello {world}" where "world" is a React component. They can also be used in combination, e.g. "Hello <strong>{world}</strong>". By default, the following tags are supported: <strong>, <b>, <em>, <i>. Otherwise, custom implementations of tags can be provided via the `params` argument.
   * @param key The key that corresponds to the translation string in the locale file.
   * @param params An object where the keys correspond to the placeholders in the translation string, and the values are React components or functions that return React components. A custom implementation of the tags can also be provided here: e.g. {strong: (chunks) => <span className="font-bold">{chunks}</span>} if the translation string is "Hello <strong>world</strong>".
   * @returns A ReactNode that can be rendered directly in a React component.
   * @example t.tRich('greeting', {world: <strong>world</strong>})
   */
  const tRich = <K extends Leaves<Translation[NS]>>(
    key: K,
    params: Record<string, RichParam> = {}
  ): ReactNode => {
    if (!context || !context.locale) {
      const keyStr = String(key);
      return keyStr.split('.').pop() || keyStr;
    }
    const str = get(context.locale[namespace], key, '') as string;
    return renderRich(str, { ...defaultTags, ...params });
  };

  return Object.assign(t, { tRich });
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
