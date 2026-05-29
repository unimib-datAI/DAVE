import { useForm, useCollectionPermissions } from '@/hooks';
import { LLMButton } from '@/modules/search/LLMButton';
import { Searchbar } from '@/modules/search/Searchbar';

import { useRouter } from 'next/router';
import { UploadDocumentsModal } from '@/components/UploadDocumentsModal';
import { UploadProgressIndicator } from '@/components/UploadProgressIndicator';
import { useAtom } from 'jotai';
import { uploadModalOpenAtom } from '@/atoms/upload';
import { ToolbarLayout } from '@/components/ToolbarLayout';
import { GetServerSideProps } from 'next';
import { getSession } from 'next-auth/react';
import { useText } from '@/components/TranslationProvider';
import { Button, Tooltip } from '@heroui/react';

const Homepage = () => {
  const router = useRouter();
  const [, setUploadModalOpen] = useAtom(uploadModalOpenAtom);
  const { canUpdate } = useCollectionPermissions();
  const { register, onSubmit, setValue } = useForm({
    text: '',
  });
  const t = useText('home');

  const handleSubmit = ({ text }: { text: string }) => {
    const url = {
      pathname: '/search',
      query: { ...router.query, text },
    };
    router.push(url, undefined, { shallow: true });
  };

  return (
    <ToolbarLayout>
      <div className="flex flex-col items-center justify-center text-center w-full gap-14 h-screen">
        <div className="flex flex-col items-center text-center -mt-40 gap-2">
          <h1 className="text-7xl font-bold leading-tight">{t('title')}</h1>
          <h2 className="text-3xl font-normal leading-snug">
            {t('subtitle.document')}
            <span className="inline-block underline-yellow">Assistant</span>
            {' for '}
            <span className="inline-block underline-blue">
              {t('subtitle.validation')}
            </span>
          </h2>
          <h2 className="text-3xl font-normal leading-snug">
            and{' '}
            <span className="inline-block underline-green">
              {t('subtitle.exploration')}
            </span>
            .
          </h2>
        </div>

        <form onSubmit={onSubmit(handleSubmit)} className="w-full max-w-2xl">
          <Searchbar
            {...register('text')}
            placeholder={t('searchPlaceholder')}
          />
        </form>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Button
            color="primary"
            onPress={() => {
              handleSubmit({ text: '' });
            }}
          >
            {t('buttons.seeAllDocuments')}
          </Button>
          {canUpdate ? (
            <Button color="secondary" onPress={() => setUploadModalOpen(true)}>
              {t('buttons.uploadAnnotatedDocuments')}
            </Button>
          ) : (
            <Tooltip
              content={t('buttons.uploadNoPermission')}
              placement="top"
              color="foreground"
            >
              <span>
                <Button color="secondary" isDisabled>
                  {t('buttons.uploadAnnotatedDocuments')}
                </Button>
              </span>
            </Tooltip>
          )}
        </div>
      </div>
      <LLMButton />
      <UploadDocumentsModal />
    </ToolbarLayout>
  );
};

// Protect this page - require authentication unless USE_AUTH is false
export const getServerSideProps: GetServerSideProps = async (context) => {
  if (process.env.USE_AUTH !== 'false') {
    const session = await getSession(context);

    if (!session) {
      return {
        redirect: {
          destination: '/sign-in',
          permanent: false,
        },
      };
    }
  }

  const locale = process.env.LOCALE || 'eng';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};

export default Homepage;
