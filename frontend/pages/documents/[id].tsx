import { ToolbarLayout, useText } from '@/components';
import { ReactElement, useEffect, useState } from 'react';
import { NextPageWithLayout } from '../_app';
import DocumentProvider from '@/modules/document/DocumentProvider/DocumentProvider';
import ToolbarContent from '@/modules/document/ToolbarContent/ToolbarContent';
import { ContentLayout } from '@/modules/document/ContentLayout';
import {
  selectViews,
  selectDocumentData,
  useDocumentDispatch,
  useSelector,
} from '@/modules/document/DocumentProvider/selectors';
import ViewProvider from '@/modules/document/ViewProvider/ViewProvider';
import { MultiPane } from '@/components/MultiPane';
import dynamic from 'next/dynamic';
import withLocale from '@/components/TranslationProvider/withLocale';
import { useRouter } from 'next/router';
import { LLMButton } from '@/modules/search/LLMButton';

const SidebarAnnotationDetails = dynamic(
  () =>
    import(
      '../../modules/document/SidebarAnnotationDetails/SidebarAnnotationDetails'
    )
);
const NewAnnotationSetModal = dynamic(
  () =>
    import('../../modules/document/NewAnnotationSetModal/NewAnnotationSetModal')
);

const Document: NextPageWithLayout = () => {
  const views = useSelector(selectViews);
  const doc = useSelector(selectDocumentData);
  const router = useRouter();
  const dispatch = useDocumentDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const t = useText('document');
  useEffect(() => {
    const { annotationSetId, annotationId } = router.query;
    if (annotationSetId != null) {
      dispatch({
        type: 'changeAnnotationSet',
        payload: {
          viewIndex: 0,
          annotationSet: `entities_${annotationSetId}` as string,
        },
      });
    }

    setTimeout(() => {
      if (annotationId != null) {
        //todo: add loading
        setIsLoading(true);
        const element = document.getElementById(`entity-tag-${annotationId}`);
        if (!element) return;

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const observer = new IntersectionObserver(
          (entries) => {
            const [entry] = entries;

            if (entry.isIntersecting) {
              observer.unobserve(element);
              dispatch({
                type: 'highlightAnnotation',
                payload: {
                  annotationId: Number(annotationId),
                },
              });
              setIsLoading(false);
            }
          },
          { root: null, rootMargin: '0px', threshold: 1 }
        );

        observer.observe(element);
      }
    }, 200);
  }, [router.query]);

  return (
    <>
      <h1
        id="document-title"
        data-testid="document-title"
        style={{ display: 'none' }}
      >
        {doc?.features?.title || doc?.features?.name || doc?.id}
      </h1>
      <MultiPane>
        {views.map((view, index) => (
          <ViewProvider key={index} viewIndex={index} isLoading={isLoading} />
        ))}
      </MultiPane>
      <SidebarAnnotationDetails />
      <NewAnnotationSetModal />
    </>
  );
};

Document.getLayout = function getLayout(page: ReactElement) {
  return (
    <>
      <DocumentProvider>
        <ToolbarLayout toolbarContent={<ToolbarContent />}>
          <ContentLayout>{page}</ContentLayout>
        </ToolbarLayout>
      </DocumentProvider>
      <LLMButton />
    </>
  );
};

export const getServerSideProps = withLocale(() => {
  return {
    props: {},
  };
});

export default Document;
