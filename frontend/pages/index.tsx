import { useForm } from '@/hooks';
import { LLMButton } from '@/modules/search/LLMButton';
import { Searchbar } from '@/modules/search/Searchbar';
import Button from '@/components/Button/Button';

import { useRouter } from 'next/router';
import { UploadDocumentsModal } from '@/components/UploadDocumentsModal';
import { UploadProgressIndicator } from '@/components/UploadProgressIndicator';
import { useAtom } from 'jotai';
import { uploadModalOpenAtom } from '@/atoms/upload';
import { ToolbarLayout } from '@/components/ToolbarLayout';
import { GetServerSideProps } from 'next';
import { getSession } from 'next-auth/react';
import { useText } from '@/components/TranslationProvider';

const Homepage = () => {
  const router = useRouter();
  const [, setUploadModalOpen] = useAtom(uploadModalOpenAtom);
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
        <div className="flex flex-col items-center text-center -mt-40">
          <h1>{t('title')}</h1>
          <h2 className="font-normal">
            {t('subtitle.document')}
            <span className="inline-block underline-yellow">
              {t('subtitle.annotation')}
            </span>{' '}
            <span className=" inline-block underline-blue">
              {t('subtitle.validation')}
            </span>
          </h2>
          <h2 className="-mt-5 font-normal">
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
            auto
            color="default"
            css={{ backgroundColor: 'black', color: 'white' }}
            onPress={() => {
              // router.push('/documents');
              handleSubmit({ text: '' });
            }}
          >
            {t('buttons.seeAllDocuments')}
          </Button>
          <Button auto color="primary" onPress={() => setUploadModalOpen(true)}>
            {t('buttons.uploadAnnotatedDocuments')}
          </Button>
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

  const locale = process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};

export default Homepage;
