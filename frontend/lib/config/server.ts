/**
 * Server-side configuration — the single source of truth for every
 * non-public environment variable the Node process reads.
 *
 * NEVER import this from browser code. It is not a hard secret leak (Next
 * strips non-`NEXT_PUBLIC_*` vars to `undefined` in client bundles) but it
 * would silently give you empty config. Browser code uses `./public`.
 *
 * Design notes:
 *  - Values mirror the historical inline defaults exactly, EXCEPT where a
 *    variable previously had *different* defaults at different call sites —
 *    those are unified here and called out in comments (see `keycloak`).
 *  - Nothing throws at import time (that would break `next build`). Call
 *    `assertServerConfig()` from a startup path to fail fast on missing
 *    required vars.
 */

import { publicConfig } from './public';

const str = (v: string | undefined, fallback = ''): string =>
  v === undefined || v === '' ? fallback : v;

const int = (v: string | undefined, fallback: number): number => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (v: string | undefined, fallback: boolean): boolean =>
  v === undefined ? fallback : v !== 'false';

export const serverConfig = {
  app: {
    /**
     * Whether auth is enforced server-side (Keycloak token verification +
     * permission checks + outbound Basic auth). MUST agree with
     * `publicConfig.useAuth`.
     */
    useAuth: process.env.USE_AUTH !== 'false',
    /** Restrict the UI to a single documents route (STATALE deployment). */
    stataleMode: process.env.STATALE_MODE === 'true',
    /**
     * Server-render locale key (loads `@/translation/<locale>`). Note: page
     * `getServerSideProps` historically defaulted this to 'eng' in some
     * files and 'ita' in others — unified to 'eng' here; migrate pages to
     * this field to make the default consistent.
     */
    locale: str(process.env.LOCALE, 'eng'),
    /** Vercel deployment URL (server-side variant), if hosting on Vercel. */
    vercelUrl: str(process.env.VERCEL_URL),
  },

  mongo: {
    /** Required. Full connection string incl. credentials + db + authSource. */
    uri: process.env.MONGO,
  },

  elastic: {
    host: str(process.env.ELASTIC_HOST, 'es'),
    port: str(process.env.ELASTIC_PORT, '9200'),
    /** Required in practice — the index every search/index op targets. */
    index: str(process.env.ELASTIC_INDEX),
    get node(): string {
      return `http://${this.host}:${this.port}`;
    },
  },

  llm: {
    /** OpenAI-compatible base URL for text generation. */
    baseUrl: str(process.env.API_LLM, 'http://localhost:8000/v1'),
    apiKey: str(process.env.LLM_KEY, 'dummy-key'),
    /** `LLM_NAME` then legacy `DEFAULT_MODEL` then a hard default. */
    model: str(
      process.env.LLM_NAME,
      str(process.env.DEFAULT_MODEL, 'phi4-mini')
    ),
  },

  /** The one remaining call into the Python `qavectorizer` service. */
  embeddings: {
    /** Required for indexing/RAG. `POST {baseUrl}/embed`. */
    baseUrl: str(process.env.API_INDEXER),
  },

  anonymization: {
    /** Vault transit endpoint. Empty ⇒ anonymization disabled (pass-through). */
    endpoint: str(process.env.ANONYMIZATION_ENDPOINT).trim(),
    get enabled(): boolean {
      return this.endpoint.length > 0;
    },
  },

  keycloak: {
    /**
     * Prior code had three different defaults for these across
     * `[...nextauth].ts` (''), `keycloakAuth.ts` and `keycloakService.ts`.
     * Unified to the `.env.sample` values. In every real deployment the env
     * vars are set, so the default is effectively dead — but see
     * architecture doc 01 §8 for the `DAVE` vs `dave` realm-case issue that
     * this does NOT fix.
     */
    issuer: str(
      process.env.KEYCLOAK_ISSUER,
      'http://keycloak:8080/realms/DAVE'
    ),
    clientId: str(process.env.KEYCLOAK_ID, 'dave_client'),
    clientSecret: str(process.env.KEYCLOAK_SECRET),
    adminUser: str(process.env.KEYCLOAK_ADMIN, 'admin'),
    adminPassword: str(process.env.KEYCLOAK_ADMIN_PASSWORD, 'admin'),
  },

  nextAuth: {
    secret: str(process.env.NEXTAUTH_SECRET),
  },

  /** Local email/password JWT auth path (no UI caller; external consumers only). */
  localAuth: {
    jwtSecret: str(process.env.JWT_SECRET, 'secret'),
    accessTokenExpiresSec: int(process.env.ACCESS_TOKEN_EXPIRES_IN, 3600),
    refreshTokenExpiresSec: int(
      process.env.REFRESH_TOKEN_EXPIRES_IN,
      7 * 24 * 3600
    ),
    bcryptSaltRounds: int(process.env.BCRYPT_SALT_ROUNDS, 12),
  },

  /** Seed credentials for the bootstrap admin user (see db/models/User). */
  adminSeed: {
    email: str(process.env.ADMIN_EMAIL, 'admin@daveadmin.com'),
    password: str(process.env.ADMIN_PASSWORD, 'daveAdmin42!'),
  },

  /** Legacy Python backend still proxied by infer/annotation/taxonomy/review routers. */
  externalBackend: {
    baseUri: str(process.env.API_BASE_URI),
    username: str(process.env.API_USERNAME),
    password: str(process.env.API_PASSWORD),
  },

  /** Annotation pipeline step endpoints (legacy slot-map fallback defaults). */
  annotationPipeline: {
    ner: str(
      process.env.ANNOTATION_SPACYNER_URL,
      'http://spacyner:80/api/spacyner'
    ),
    nel: str(
      process.env.ANNOTATION_BLINK_URL,
      'http://biencoder:80/api/blink/biencoder/mention/doc'
    ),
    indexer: str(
      process.env.ANNOTATION_INDEXER_URL,
      'http://indexer:80/api/indexer/search/doc'
    ),
    nilPrediction: str(
      process.env.ANNOTATION_NILPREDICTION_URL,
      'http://nilpredictor:80/api/nilprediction/doc'
    ),
    nilClustering: str(
      process.env.ANNOTATION_NILCLUSTER_URL,
      'http://clustering:80/api/clustering'
    ),
    consolidation: str(
      process.env.ANNOTATION_CONSOLIDATION_URL,
      'http://consolidation:80/api/consolidation'
    ),
  },

  /**
   * Per-source document-retrieval fallbacks (documentRetrievers.ts). The
   * hard-coded `10.0.0.108:300x` defaults are dev-lab addresses — override
   * every one in real deployments.
   */
  sourceRetrievers: {
    batini: str(process.env.PIPELINE_ADDRESS, 'http://10.0.0.108:3001'),
    demo: str(process.env.DEMO_PIPELINE_ADDRESS, 'http://10.0.0.108:3002'),
    sperimentazione: str(
      process.env.SPERIMENTAZIONE_PIPELINE_ADDRESS,
      'http://10.0.0.108:3003'
    ),
    indagini: str(
      process.env.INDAGINI_PIPELINE_ADDRESS,
      'http://10.0.0.108:3004'
    ),
    mirko: str(process.env.MIRKO_PIPELINE_ADDRESS, 'http://10.0.0.108:3005'),
    renzo: str(process.env.RENZO_PIPELINE_ADDRESS, 'http://10.0.0.108:3006'),
    messages: str(
      process.env.MESSAGES_PIPELINE_ADDRESS,
      'http://10.0.0.108:3007'
    ),
    eu: str(process.env.EU_PIPELINE_ADDRESS, 'http://10.0.0.108:3008'),
    euV2: str(process.env.EU_V2_PIPELINE_ADDRESS, 'http://10.0.0.108:3009'),
    anonymization: str(
      process.env.ANONYMIZATION_PIPELINE_ADDRESS,
      'http://documents:3001'
    ),
  },
} as const;

export type ServerConfig = typeof serverConfig;

/** Re-exported for convenience so server code needs one import. */
export { publicConfig };

/**
 * Fail-fast validation for a startup path. Throws when a genuinely required
 * variable is missing; warns for strongly-recommended ones. Safe to call
 * multiple times.
 */
export function assertServerConfig(): void {
  const missing: string[] = [];
  if (!serverConfig.mongo.uri) missing.push('MONGO');
  if (!serverConfig.elastic.index) missing.push('ELASTIC_INDEX');

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  const warn: Array<[string, boolean]> = [
    [
      'NEXTAUTH_SECRET',
      !serverConfig.nextAuth.secret && serverConfig.app.useAuth,
    ],
    [
      'KEYCLOAK_ISSUER',
      !process.env.KEYCLOAK_ISSUER && serverConfig.app.useAuth,
    ],
    ['API_INDEXER', !serverConfig.embeddings.baseUrl],
  ];
  for (const [name, isMissing] of warn) {
    if (isMissing) {
      // eslint-disable-next-line no-console
      console.warn(
        `[config] recommended environment variable ${name} is not set`
      );
    }
  }
}
