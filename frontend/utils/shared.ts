import { ProcessedCluster } from '@/modules/document/DocumentProvider/types';
import { Document } from '@/server/routers/document';
import { CSS } from '@nextui-org/react';

/**
 * Encode a string to uri component.
 */
export const fixedEncodeURIComponent = (value: string) => {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    })
    .replace(/%20/g, '+');
};

export const toBase64 = (data: string) => {
  return Buffer.from(data).toString('base64');
};

export const styles = (styles: CSS) => {
  return { css: styles };
};

export const isEmptyObject = (obj: any) => {
  for (const key in obj) return false;
  return true;
};

export const removeProp = <T>(obj: T, prop: keyof T) => {
  const { [prop]: remove, ...rest } = obj;
  return rest;
};

export const removeProps = <T>(
  obj: T,
  props: (keyof T)[]
): Omit<T, keyof T> => {
  const prop = props.pop();
  if (!prop) {
    return obj;
  }
  const newObj = removeProp(obj, prop) as T;
  return removeProps(newObj, props);
};

export const deepEqual = (a: any, b: any) => {
  if (a === b) return true;

  if (a == null || typeof a != 'object' || b == null || typeof b != 'object')
    return false;

  let propsInA = 0,
    propsInB = 0;

  for (let prop in a) {
    propsInA += 1;
  }

  for (let prop in b) {
    propsInB += 1;
    if (!(prop in a) || !deepEqual(a[prop], b[prop])) return false;
  }

  return propsInA == propsInB;
};

export const forEachCouple = <T>(
  array: T[],
  callback: (current: T, next: T | undefined, index: number) => boolean | void
) => {
  let index = 0;
  for (const item of array) {
    const keepGoing = callback(item, array[index + 1], index);
    if (keepGoing === false) {
      break;
    }
    index += 1;
  }
};

export const beautifyString = (val: string) => {
  const rgx = new RegExp('_', 'g');
  return `${val.charAt(0).toUpperCase()}${val.slice(1)}`.replace(rgx, ' ');
};

const elementsToShift = [
  'right-sidebar',
  'toolbar',
  'annotation-details-sidebar',
];

export const forEachElement = (
  arr: string[],
  cb: (elem: HTMLElement) => void
) => {
  arr.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      cb(element);
    }
  });
};

export type NoInfer<A extends any> = [A][A extends any ? 0 : never];

export function memo<TDeps extends readonly any[], TResult>(
  getDeps: () => [...TDeps],
  fn: (...args: NoInfer<[...TDeps]>) => TResult,
  opts: {
    key: any;
    debug?: () => any;
    onChange?: (result: TResult) => void;
  }
): () => TResult {
  let deps: any[] = [];
  let result: TResult | undefined;

  return () => {
    let depTime: number;
    if (opts.key && opts.debug) depTime = Date.now();

    const newDeps = getDeps();

    const depsChanged =
      newDeps.length !== deps.length ||
      newDeps.some((dep: any, index: number) => deps[index] !== dep);

    if (!depsChanged) {
      return result!;
    }

    deps = newDeps;

    let resultTime: number;
    if (opts.key && opts.debug) resultTime = Date.now();

    result = fn(...newDeps);
    opts?.onChange?.(result);

    if (opts.key && opts.debug) {
      if (opts?.debug()) {
        const depEndTime = Math.round((Date.now() - depTime!) * 100) / 100;
        const resultEndTime =
          Math.round((Date.now() - resultTime!) * 100) / 100;
        const resultFpsPercentage = resultEndTime / 16;

        const pad = (str: number | string, num: number) => {
          str = String(str);
          while (str.length < num) {
            str = ' ' + str;
          }
          return str;
        };

        console.info(
          `%c⏱ ${pad(resultEndTime, 5)} /${pad(depEndTime, 5)} ms`,
          `
            font-size: .6rem;
            font-weight: bold;
            color: hsl(${Math.max(
              0,
              Math.min(120 - 120 * resultFpsPercentage, 120)
            )}deg 100% 31%);`,
          opts?.key
        );
      }
    }

    return result!;
  };
}

export const stopScroll = () => {
  document.body.setAttribute('style', 'overflow: hidden; padding-right: 17px');
  forEachElement(elementsToShift, (elem) => {
    elem.setAttribute('style', 'right: 17px');
  });
};

export const removeStopScroll = () => {
  document.body.setAttribute('style', '');
  forEachElement(elementsToShift, (elem) => {
    elem.setAttribute('style', '');
  });
};

export const groupBy = <T>(
  array: T[],
  predicate: (value: T, index: number, array: T[]) => string
) =>
  array.reduce((acc, value, index, array) => {
    (acc[predicate(value, index, array)] ||= []).push(value);
    return acc;
  }, {} as { [key: string]: T[] });

export const createObjectFromJson = <T>(jsonObject: any): T => {
  const result: any = {};

  for (const key in jsonObject) {
    if (jsonObject.hasOwnProperty(key)) {
      if (typeof jsonObject[key] !== 'undefined') {
        result[key] = jsonObject[key];
      }
    }
  }

  return result as T;
};

export function maskWords(inputString: string) {
  // Split the input string into an array of words
  if (!inputString) {
    return '';
  }
  const words = inputString.split(' ');

  // Iterate through each word and replace letters with *
  const maskedWords = words.map((word: string) => {
    if (word.length <= 1) {
      // If the word has only one character, don't mask it
      return word;
    } else {
      // Replace all characters except the first one with *
      const firstLetter = word.charAt(0);
      const maskedPart = '*'.repeat(word.length - 1);
      return firstLetter + maskedPart;
    }
  });

  // Join the masked words back into a single string
  const maskedString = maskedWords.join(' ');

  return maskedString;
}

export function getStartAndEndIndexForPagination(page: number, text: string) {
  const pageSize = 4000;
  const totalPages = Math.ceil(text.length / pageSize);

  // First page: show first two pages worth of content
  if (page === 1) {
    return {
      startIndex: 0,
      endIndex: Math.min(pageSize * 2, text.length),
      stopPagination: false,
    };
  }
  // Middle pages: show current page plus one page buffer on each side
  else if (page < totalPages) {
    const startIndex = Math.max(0, (page - 2) * pageSize);
    const endIndex = Math.min(text.length, (page + 1) * pageSize);
    return {
      startIndex,
      endIndex,
      stopPagination: false
    };
  }
  // Last page: show last two pages worth of content
  else {
    const startIndex = Math.max(0, text.length - pageSize * 2);
    return {
      startIndex,
      endIndex: text.length,
      stopPagination: true
    };
  }
}

export function getClustersGroups(data: Document, annSetName: string) {
  const annSetClusters = data.features.clusters[annSetName];
  if (!annSetClusters) {
    return;
  }
  let text = data.text;
  let annSet = data.annotation_sets[annSetName];
  const clusters = annSetClusters.map((cluster) => {
    const mentions = cluster.mentions.map((mention) => {
      const ann = annSet.annotations.find((ann) => ann.id === mention.id);

      if (!ann) {
        return mention;
      }

      const startOffset = ann.start - 10 < 0 ? 0 : ann.start - 10;
      const endOffset = ann.end + 50 > text.length ? text.length : ann.end + 50;

      return {
        ...mention,
        mentionText: `...${text.slice(startOffset, endOffset)}...`,
      };
    });

    return {
      ...cluster,
      mentions: mentions.filter((m) => (m as any).mentionText),
    } as ProcessedCluster;
  });

  return groupBy(clusters, (cluster) => cluster.type);
}
