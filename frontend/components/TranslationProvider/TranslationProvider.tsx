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

const TranslationProvider = ({
  locale,
  children,
}: TranslationProviderProps) => {
  return (
    <TranslationContext.Provider value={{ locale }}>
      {children}
    </TranslationContext.Provider>
  );
};

export default TranslationProvider;
