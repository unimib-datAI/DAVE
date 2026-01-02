import { useForm } from '@/hooks';
import { LLMButton } from '@/modules/search/LLMButton';
import { Searchbar } from '@/modules/search/Searchbar';
import { Button } from '@/components';
import { useRouter } from 'next/router';
import { UploadDocumentsModal } from '@/components/UploadDocumentsModal';
import { UploadProgressIndicator } from '@/components/UploadProgressIndicator';
import { useAtom } from 'jotai';
import { uploadModalOpenAtom } from '@/atoms/upload';
import { ToolbarLayout } from '@/components/ToolbarLayout';

const Homepage = () => {
  const router = useRouter();
  const [, setUploadModalOpen] = useAtom(uploadModalOpenAtom);
  const { register, onSubmit, setValue } = useForm({
    text: '',
  });

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
          <h1>DAVE</h1>
          <h2 className="font-normal">
            Document{' '}
            <span className="inline-block underline-yellow">Annotation</span>{' '}
            <span className=" inline-block underline-blue">Validation</span>
          </h2>
          <h2 className="font-normal">
            and{' '}
            <span className="inline-block underline-green">Exploration</span>.
          </h2>
        </div>

        <form onSubmit={onSubmit(handleSubmit)} className="w-full max-w-2xl">
          <Searchbar {...register('text')} />
        </form>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Button
            color="default"
            variant="solid"
            style={{ zIndex: 1 }}
            onPress={() => {
              // router.push('/documents');
              handleSubmit({ text: '' });
            }}
          >
            See all documents
          </Button>
          <Button
            color="primary"
            variant="solid"
            style={{ zIndex: 1 }}
            onPress={() => setUploadModalOpen(true)}
          >
            Upload annotated documents
          </Button>
        </div>
      </div>
      <LLMButton />
      <UploadDocumentsModal />
    </ToolbarLayout>
  );
};

export default Homepage;
