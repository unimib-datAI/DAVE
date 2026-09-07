import { Document, EntityAnnotation } from '@/lib/types/document';

/**
 * Builds an in-memory {@link Document} from a lightweight JSON payload so the
 * standard document view (`modules/document/*`) can render arbitrary
 * text + annotations without them being stored on the server.
 *
 * Consumed by `pages/quickView.tsx`. The expected payload shape is the one
 * produced by the GATE / annotation tooling, e.g.:
 *
 * ```json
 * {
 *   "label": "full document text ...",
 *   "annotations": {
 *     "GateNLP_NER": [
 *       {
 *         "id": 0,
 *         "type": "GPE",
 *         "target": { "selector": { "type": "TextPositionSelector", "start": 171, "end": 181 } },
 *         "features": { "text": "Manchester", "entity": { "id": "wd:Q18125", "name": "Manchester", "match": true } }
 *       }
 *     ]
 *   }
 * }
 * ```
 */

export type QuickViewSelector = {
  type?: string;
  start: number;
  end: number;
};

export type QuickViewEntity = {
  id?: string;
  name?: string;
  match?: boolean;
};

export type QuickViewAnnotation = {
  id?: number;
  type?: string;
  target?: {
    selector?: QuickViewSelector | QuickViewSelector[];
  };
  features?: {
    text?: string;
    entity?: QuickViewEntity | null;
    [key: string]: unknown;
  };
};

export type QuickViewInput = {
  /** Full document text. The sample payloads use `label`; `text` is also accepted. */
  label?: string;
  text?: string;
  /** Optional display name for the toolbar / title. */
  name?: string;
  /** Map of annotation-set name -> annotations. */
  annotations?: Record<string, QuickViewAnnotation[]>;
};

/** `wd:Q18125` / `Q18125` -> `https://www.wikidata.org/wiki/Q18125` (or `''`). */
const wikidataUrl = (id?: string): string => {
  if (!id) return '';
  const qid = id.replace(/^wd:/i, '').trim();
  return /^Q\d+$/.test(qid) ? `https://www.wikidata.org/wiki/${qid}` : '';
};

const firstSelector = (
  ann: QuickViewAnnotation
): QuickViewSelector | undefined => {
  const selector = ann.target?.selector;
  if (Array.isArray(selector)) return selector[0];
  return selector ?? undefined;
};

const buildAnnotation = (
  ann: QuickViewAnnotation,
  index: number,
  text: string
): EntityAnnotation | null => {
  const selector = firstSelector(ann);
  if (
    !selector ||
    typeof selector.start !== 'number' ||
    typeof selector.end !== 'number' ||
    selector.end <= selector.start
  ) {
    return null;
  }

  const id = typeof ann.id === 'number' ? ann.id : index;
  const type = ann.type || 'UNKNOWN';
  const entity = ann.features?.entity ?? undefined;
  const mention =
    ann.features?.text ?? text.slice(selector.start, selector.end);
  const url = wikidataUrl(entity?.id);
  const isNil = !entity;

  const topCandidate = entity
    ? {
        id: 0,
        indexer: 0,
        score: entity.match ? 1 : 0,
        raw_score: entity.match ? 1 : 0,
        norm_score: entity.match ? 1 : 0,
        title: entity.name ?? mention,
        url,
      }
    : undefined;

  return {
    id,
    start: selector.start,
    end: selector.end,
    type,
    features: {
      mention,
      text: mention,
      cluster: -1,
      title: entity?.name ?? '',
      url,
      is_nil: isNil,
      additional_candidates: [],
      ner: {
        source: 'quickview',
        spacy_model: '',
        type,
        score: 1,
      },
      linking: {
        source: 'quickview',
        is_nil: isNil,
        nil_score: 0,
        // The rest of the app tolerates a missing top_candidate for NIL
        // annotations (see SidebarAnnotationDetails).
        top_candidate: topCandidate as any,
        candidates: topCandidate ? [topCandidate] : [],
      },
    },
  } as EntityAnnotation;
};

export function buildQuickViewDocument(input: QuickViewInput): Document {
  if (input == null || typeof input !== 'object') {
    throw new Error('QuickView payload must be a JSON object');
  }

  const text = input.text ?? input.label ?? '';
  if (typeof text !== 'string') {
    throw new Error('QuickView payload must have a string `label` (or `text`)');
  }

  const annotation_sets: Document['annotation_sets'] = {};

  for (const [rawName, rawAnns] of Object.entries(input.annotations ?? {})) {
    // The document view only surfaces annotation sets whose name starts with
    // `entities_` (see DocumentProvider.initializeState) - normalise here.
    const name = rawName.startsWith('entities_')
      ? rawName
      : `entities_${rawName}`;

    const annotations = (Array.isArray(rawAnns) ? rawAnns : [])
      .map((ann, index) => buildAnnotation(ann, index, text))
      .filter((ann): ann is EntityAnnotation => ann != null)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    const nextAnnId =
      annotations.reduce((max, ann) => Math.max(max, ann.id), -1) + 1;

    annotation_sets[name] = { name, next_annid: nextAnnId, annotations };
  }

  // Guarantee at least one `entities_` set so the view has an active set.
  if (Object.keys(annotation_sets).length === 0) {
    annotation_sets['entities_quickview'] = {
      name: 'entities_quickview',
      next_annid: 0,
      annotations: [],
    };
  }

  return {
    _id: 'quickview',
    id: 0,
    name: input.name || 'Quick View',
    preview: text.slice(0, 200),
    text,
    collectionId: '',
    features: { clusters: {} },
    annotation_sets,
  };
}

/**
 * Decodes the `?data=` query param. Accepts raw (URL-decoded) JSON or
 * base64 / base64url-encoded JSON.
 */
export function decodeQuickViewData(raw: string): QuickViewInput {
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    /* not raw JSON - try base64 below */
  }

  try {
    const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const binary =
      typeof window !== 'undefined'
        ? window.atob(normalized)
        : Buffer.from(normalized, 'base64').toString('binary');
    // Handle UTF-8 payloads that went through btoa(unescape(encodeURIComponent(...)))
    const json = decodeURIComponent(
      binary
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    throw new Error(
      'Could not parse the `data` param - expected JSON or base64-encoded JSON'
    );
  }
}

/** Encodes a payload for a shareable `?data=` link (base64url of UTF-8 JSON). */
export function encodeQuickViewData(input: QuickViewInput): string {
  const json = JSON.stringify(input);
  const base64 =
    typeof window !== 'undefined'
      ? window.btoa(
          encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
            String.fromCharCode(parseInt(p1, 16))
          )
        )
      : Buffer.from(json, 'utf-8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
