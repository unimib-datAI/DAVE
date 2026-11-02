import eng from './eng';
import { Translation } from './type';

export const DEFAULT_LOCALE = 'eng';

/** English is always bundled: it is what every missing locale or key falls back to. */
export const fallbackTranslation: Translation = eng;

const loaders: Record<string, () => Promise<{ default: Translation }>> = {
  eng: () => import('./eng'),
  ita: () => import('./ita'),
};

const aliases: Record<string, string> = { en: 'eng', it: 'ita' };

const normalize = (candidate: string | null | undefined) => {
  const key = candidate?.trim().toLowerCase();
  return key ? aliases[key] ?? key : undefined;
};

const isSupported = (key: string | undefined): key is string =>
  !!key && Object.prototype.hasOwnProperty.call(loaders, key);

/**
 * Returns the first candidate that is a supported locale (e.g. a cookie value,
 * a localStorage value, the LOCALE env var), otherwise English. Unknown or
 * malformed values never reach an import path.
 */
export const resolveLocaleKey = (
  ...candidates: Array<string | null | undefined>
): string => {
  for (const candidate of candidates) {
    const key = normalize(candidate);
    if (isSupported(key)) return key;
  }
  return DEFAULT_LOCALE;
};

export const loadLocale = async (
  ...candidates: Array<string | null | undefined>
): Promise<Translation> => {
  const key = resolveLocaleKey(...candidates);
  const unsupported = candidates.filter((c) => c && !isSupported(normalize(c)));
  console.info(
    `[i18n] using locale "${key}" (requested: ${JSON.stringify(candidates)})`
  );
  if (unsupported.length) {
    console.warn(
      `[i18n] unsupported locale ${JSON.stringify(
        unsupported
      )} ignored, using "${key}"`
    );
  }
  return (await loaders[key]()).default;
};
