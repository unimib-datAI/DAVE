import { ToolbarLayout } from '@/components';
import {
  PropsWithChildren,
  ReactElement,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { NextPageWithLayout } from './_app';
import DocumentProvider from '@/modules/document/DocumentProvider/DocumentProvider';
import ToolbarContent from '@/modules/document/ToolbarContent/ToolbarContent';
import { ContentLayout } from '@/modules/document/ContentLayout';
import {
  selectViews,
  useSelector,
} from '@/modules/document/DocumentProvider/selectors';
import ViewProvider from '@/modules/document/ViewProvider/ViewProvider';
import { MultiPane } from '@/components/MultiPane';
import dynamic from 'next/dynamic';
import withLocale from '@/components/TranslationProvider/withLocale';
import { useRouter } from 'next/router';
import styled from '@emotion/styled';
import { Document } from '@/lib/types/document';
import {
  buildQuickViewDocument,
  decodeQuickViewData,
  encodeQuickViewData,
  QuickViewInput,
} from '@/lib/quickView/buildDocument';

const SidebarAnnotationDetails = dynamic(
  () =>
    import(
      '../modules/document/SidebarAnnotationDetails/SidebarAnnotationDetails'
    )
);
const NewAnnotationSetModal = dynamic(
  () => import('../modules/document/NewAnnotationSetModal/NewAnnotationSetModal')
);

/**
 * QuickView renders the full standard document view (toolbar, entity sidebar,
 * annotation details, render-mode toggle, ...) from a JSON payload passed in
 * the URL instead of a server-stored document. It is read-only: there is no
 * collection to save annotations back to.
 *
 * Input (client-side, from `router.query`):
 *  - `?data=<json|base64>` - the payload inline. Raw URL-encoded JSON or
 *    base64 / base64url-encoded JSON. Subject to browser URL length limits;
 *    use `?src=` for large payloads.
 *  - `?src=<url>`          - a URL the payload JSON is fetched from.
 *
 * With neither param a small paste box is shown that builds a `?data=` link.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Page body - rendered inside the DocumentProvider set up by getLayout
// ─────────────────────────────────────────────────────────────────────────────

const QuickView: NextPageWithLayout = () => {
  const views = useSelector(selectViews);

  return (
    <>
      <MultiPane>
        {views.map((_view, index) => (
          <ViewProvider key={index} viewIndex={index} isLoading={false} />
        ))}
      </MultiPane>
      <SidebarAnnotationDetails />
      <NewAnnotationSetModal />
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Shell - resolves the payload from the URL, then mounts the document stack
// ─────────────────────────────────────────────────────────────────────────────

const CenteredBox = styled.div({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'calc(100vh - 48px)',
  padding: '24px',
  background: '#FAFAFA',
});

const Card = styled.div({
  width: '100%',
  maxWidth: '720px',
  background: '#fff',
  border: '1px solid #EDEDF0',
  borderRadius: '8px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

const TextArea = styled.textarea({
  width: '100%',
  minHeight: '260px',
  fontFamily: 'monospace',
  fontSize: '13px',
  padding: '12px',
  borderRadius: '6px',
  border: '1px solid #DADAE0',
  resize: 'vertical',
});

const Button = styled.button({
  alignSelf: 'flex-start',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 18px',
  cursor: 'pointer',
  fontSize: '14px',
  '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
});

const ErrorText = styled.p({
  color: '#c0392b',
  fontSize: '13px',
  margin: 0,
  whiteSpace: 'pre-wrap',
});

const SAMPLE = `{
  "label": "Paste the document text here.",
  "annotations": {
    "GateNLP_NER": [
      {
        "id": 0,
        "type": "GPE",
        "target": { "selector": { "type": "TextPositionSelector", "start": 0, "end": 5 } },
        "features": { "text": "Paste" }
      }
    ]
  }
}`;

type QuickViewInputFormProps = {
  error?: string;
  initialValue?: string;
};

const QuickViewInputForm = ({ error, initialValue }: QuickViewInputFormProps) => {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? '');
  const [parseError, setParseError] = useState<string | null>(null);

  const handleRender = () => {
    let parsed: QuickViewInput;
    try {
      parsed = JSON.parse(value);
    } catch (e: any) {
      setParseError(`Invalid JSON: ${e.message}`);
      return;
    }
    router.push(
      { pathname: '/quickView', query: { data: encodeQuickViewData(parsed) } },
      undefined,
      { shallow: false }
    );
  };

  return (
    <CenteredBox>
      <Card>
        <h2 style={{ margin: 0, fontSize: '18px' }}>QuickView</h2>
        <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>
          Paste a document JSON (<code>label</code> + <code>annotations</code>)
          to view its text and entities. You can also link directly with{' '}
          <code>?data=</code> (inline JSON / base64) or <code>?src=</code> (URL
          to fetch).
        </p>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {parseError ? <ErrorText>{parseError}</ErrorText> : null}
        <TextArea
          value={value}
          placeholder={SAMPLE}
          onChange={(e) => {
            setValue(e.target.value);
            setParseError(null);
          }}
        />
        <Button onClick={handleRender} disabled={value.trim().length === 0}>
          Render
        </Button>
      </Card>
    </CenteredBox>
  );
};

type ShellState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; error: string }
  | { status: 'ready'; doc: Document };

const QuickViewShell = ({ children }: PropsWithChildren<{}>) => {
  const router = useRouter();
  const [state, setState] = useState<ShellState>({ status: 'loading' });

  const queryKey = useMemo(() => {
    const { data, src } = router.query;
    const first = (v: string | string[] | undefined) =>
      Array.isArray(v) ? v[0] : v;
    return { data: first(data), src: first(src) };
  }, [router.query]);

  useEffect(() => {
    if (!router.isReady) return;
    const { data, src } = queryKey;
    let cancelled = false;

    if (data) {
      try {
        const doc = buildQuickViewDocument(decodeQuickViewData(data));
        setState({ status: 'ready', doc });
      } catch (e: any) {
        setState({ status: 'error', error: e?.message ?? String(e) });
      }
      return;
    }

    if (src) {
      setState({ status: 'loading' });
      fetch(src)
        .then((r) => {
          if (!r.ok) throw new Error(`Failed to fetch payload (${r.status})`);
          return r.json();
        })
        .then((json) => {
          if (cancelled) return;
          setState({ status: 'ready', doc: buildQuickViewDocument(json) });
        })
        .catch((e: any) => {
          if (cancelled) return;
          setState({ status: 'error', error: e?.message ?? String(e) });
        });
      return () => {
        cancelled = true;
      };
    }

    setState({ status: 'empty' });
  }, [router.isReady, queryKey]);

  if (state.status === 'loading') {
    return <CenteredBox>Loading…</CenteredBox>;
  }
  if (state.status === 'empty') {
    return <QuickViewInputForm />;
  }
  if (state.status === 'error') {
    return <QuickViewInputForm error={state.error} />;
  }

  return (
    <DocumentProvider document={state.doc}>
      <ToolbarLayout toolbarContent={<ToolbarContent />}>
        <ContentLayout>{children}</ContentLayout>
      </ToolbarLayout>
    </DocumentProvider>
  );
};

QuickView.getLayout = function getLayout(page: ReactElement) {
  return <QuickViewShell>{page}</QuickViewShell>;
};

export const getServerSideProps = withLocale(() => {
  return {
    props: {},
  };
});

export default QuickView;
