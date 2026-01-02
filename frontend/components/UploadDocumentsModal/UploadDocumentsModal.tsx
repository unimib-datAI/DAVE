import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Progress,
} from '@heroui/react';
import { useAtom } from 'jotai';
import { uploadModalOpenAtom, uploadProgressAtom } from '@/atoms/upload';
import { annotationSelectedServicesAtom } from '@/atoms/annotationConfig';
import { useMutation, useContext } from '@/utils/trpc';
import { useRef, useState } from 'react';
import styled from '@emotion/styled';
import { FiUpload } from '@react-icons/all-files/fi/FiUpload';
import { FiX } from '@react-icons/all-files/fi/FiX';
import * as Tabs from '@radix-ui/react-tabs';
import { activeCollectionAtom } from '@/atoms/collection';
import { message } from 'antd';
import { useSession } from 'next-auth/react';

const UploadContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1rem 0',
});

const TabsList = styled(Tabs.List)({
  display: 'flex',
  borderBottom: '1px solid #e5e5e5',
  marginBottom: '1rem',
});

const TabsTrigger = styled(Tabs.Trigger)<{ active?: boolean }>((props) => ({
  flex: 1,
  padding: '0.75rem 1rem',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
  color: props.active ? '#0070f3' : '#666',
  borderBottom: props.active ? '2px solid #0070f3' : '2px solid transparent',
  transition: 'all 0.2s',
  '&:hover': {
    color: '#0070f3',
  },
  '&[data-state="active"]': {
    color: '#0070f3',
    borderBottom: '2px solid #0070f3',
  },
}));

const TabsContent = styled(Tabs.Content)({
  '&[data-state="active"]': {
    display: 'block',
  },
  '&[data-state="inactive"]': {
    display: 'none',
  },
});

const FileInputLabel = styled.label<{ isDragOver?: boolean }>((props) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  border: `2px dashed ${props.isDragOver ? '#0070f3' : '#ccc'}`,
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'all 0.2s',
  backgroundColor: props.isDragOver ? '#e6f3ff' : 'transparent',
  '&:hover': {
    borderColor: '#888',
    backgroundColor: '#f9f9f9',
  },
}));

const FileInput = styled.input({
  display: 'none',
});

const FileList = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  maxHeight: '200px',
  overflowY: 'auto',
});

const FileItem = styled.div({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.5rem',
  backgroundColor: '#f5f5f5',
  borderRadius: '4px',
});

const ErrorList = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  marginTop: '1rem',
  maxHeight: '150px',
  overflowY: 'auto',
});

const ErrorItem = styled.div({
  padding: '0.5rem',
  backgroundColor: '#fee',
  borderRadius: '4px',
  fontSize: '0.875rem',
  color: '#c00',
});
interface props {
  collectionId?: string;
  doneUploading?: Function;
}
export const UploadDocumentsModal = ({
  collectionId,
  doneUploading,
}: props) => {
  const [isOpen, setIsOpen] = useAtom(uploadModalOpenAtom);
  const { data: session, status } = useSession();
  const [uploadProgress, setUploadProgress] = useAtom(uploadProgressAtom);
  const [activeCollection] = useAtom(activeCollectionAtom);
  // read selected services mapping (slot -> SelectedService | null)
  const [selectedServices] = useAtom(annotationSelectedServicesAtom);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'json' | 'txt'>('json');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const txtFileInputRef = useRef<HTMLInputElement>(null);
  const createDocumentMutation = useMutation(['document.createDocument']);
  const annotateAndUploadMutation = useMutation(['document.annotateAndUpload']);
  const trpcContext = useContext();

  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
    fileType: 'json' | 'txt'
  ) => {
    const files = event.target.files;
    if (files) {
      const extension = fileType === 'json' ? '.json' : '.txt';
      const filteredFiles = Array.from(files).filter((file) =>
        file.name.endsWith(extension)
      );
      setSelectedFiles(filteredFiles);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (
    event: React.DragEvent<HTMLLabelElement>,
    fileType: 'json' | 'txt'
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const files = event.dataTransfer.files;
    if (files) {
      const extension = fileType === 'json' ? '.json' : '.txt';
      const filteredFiles = Array.from(files).filter((file) =>
        file.name.endsWith(extension)
      );
      setSelectedFiles(filteredFiles);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadJSON = async () => {
    if (selectedFiles.length === 0) return;
    if (activeCollection === undefined || activeCollection === null) {
      message.error('No active collection to upload the documents to');
      return;
    }
    setUploadProgress({
      total: selectedFiles.length,
      completed: 0,
      failed: 0,
      isUploading: true,
      errors: [],
    });

    const errors: Array<{ fileName: string; error: string }> = [];
    let completed = 0;
    let failed = 0;

    // Process files sequentially to avoid overwhelming the server
    for (const file of selectedFiles) {
      try {
        const content = await file.text();
        const jsonData = JSON.parse(content);
        if (activeCollection.id) {
          console.log('access token', session?.accesstoken);
          await createDocumentMutation.mutateAsync({
            document: jsonData,
            collectionId: collectionId || activeCollection?.id,
            token: session?.accessToken,
          });

          completed++;
          setUploadProgress((prev) => ({
            ...prev,
            completed,
          }));
        }
      } catch (error) {
        failed++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          fileName: file.name,
          error: errorMessage,
        });
        setUploadProgress((prev) => ({
          ...prev,
          failed,
          errors,
        }));
      }
    }

    // Mark upload as complete
    setUploadProgress((prev) => ({
      ...prev,
      isUploading: false,
    }));

    // Invalidate search queries to refresh document lists
    trpcContext.invalidateQueries(['search.facetedSearch']);
    trpcContext.invalidateQueries(['document.inifniteDocuments']);

    // If all uploads succeeded, close the modal after a short delay
    if (failed === 0) {
      setTimeout(() => {
        handleClose();
        if (doneUploading) {
          console.log('calling done uploading');
          doneUploading();
        }
      }, 1500);
    }
  };

  const handleUploadTXT = async () => {
    if (selectedFiles.length === 0) return;

    setUploadProgress({
      total: selectedFiles.length,
      completed: 0,
      failed: 0,
      isUploading: true,
      errors: [],
    });

    const errors: Array<{ fileName: string; error: string }> = [];
    let completed = 0;
    let failed = 0;

    // Process files sequentially to avoid overwhelming the server
    for (const file of selectedFiles) {
      try {
        const text = await file.text();

        // Resolve selected services and fallback to DEFAULT-<SLOT> naming for unset slots.
        // The backend will interpret DEFAULT-<TYPE> default records; we provide the name so the server can
        // substitute the actual default service record if needed.
        const resolvedSelectedServices = Object.fromEntries(
          Object.entries(selectedServices || {}).map(([slot, svc]) => [
            slot,
            svc
              ? { id: svc.id, name: svc.name, uri: svc.uri }
              : { id: '', name: `DEFAULT-${slot}`, uri: '' },
          ])
        );

        await annotateAndUploadMutation.mutateAsync({
          text,
          name: file.name.replace('.txt', ''),
          collectionId: collectionId || activeCollection?.id,
          token: session?.accessToken,
          selectedServices: resolvedSelectedServices,
        });

        completed++;
        setUploadProgress((prev) => ({
          ...prev,
          completed,
        }));
      } catch (error) {
        failed++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          fileName: file.name,
          error: errorMessage,
        });
        setUploadProgress((prev) => ({
          ...prev,
          failed,
          errors,
        }));
      }
    }

    // Mark upload as complete
    setUploadProgress((prev) => ({
      ...prev,
      isUploading: false,
    }));

    // Invalidate search queries to refresh document lists
    trpcContext.invalidateQueries(['search.facetedSearch']);
    trpcContext.invalidateQueries(['document.inifniteDocuments']);

    // If all uploads succeeded, close the modal after a short delay
    if (failed === 0) {
      setTimeout(() => {
        handleClose();
      }, 1500);
    }
  };

  const handleUpload = () => {
    if (activeTab === 'json') {
      handleUploadJSON();
    } else {
      handleUploadTXT();
    }
  };

  const handleClose = () => {
    if (doneUploading) {
      console.log('calling done uploadgin');
      doneUploading();
    }

    if (!uploadProgress.isUploading) {
      setIsOpen(false);
      setSelectedFiles([]);
      setUploadProgress({
        total: 0,
        completed: 0,
        failed: 0,
        isUploading: false,
        errors: [],
      });
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'json' | 'txt');
    setSelectedFiles([]);
  };

  const progressPercentage =
    uploadProgress.total > 0
      ? (uploadProgress.completed / uploadProgress.total) * 100
      : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      isDismissable={!uploadProgress.isUploading}
    >
      <ModalContent>
        <ModalHeader>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>
            Upload Documents
          </h2>
        </ModalHeader>
        <ModalBody>
          <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="json">JSON Documents</TabsTrigger>
              <TabsTrigger value="txt">Plain Text Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="json">
              <UploadContainer>
                {!uploadProgress.isUploading && uploadProgress.total === 0 && (
                  <>
                    <FileInputLabel
                      htmlFor="json-file-upload"
                      isDragOver={isDragOver && activeTab === 'json'}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 'json')}
                    >
                      <FiUpload size={32} />
                      <p style={{ marginTop: '0.5rem' }}>
                        {isDragOver
                          ? 'Drop files here'
                          : 'Click to select or drag JSON files'}
                      </p>
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#888',
                          marginTop: '0.25rem',
                        }}
                      >
                        Upload pre-annotated JSON documents
                      </p>
                    </FileInputLabel>
                    <FileInput
                      ref={fileInputRef}
                      id="json-file-upload"
                      type="file"
                      accept=".json"
                      multiple
                      onChange={(e) => handleFileSelect(e, 'json')}
                    />
                  </>
                )}

                {selectedFiles.length > 0 && !uploadProgress.isUploading && (
                  <FileList>
                    <p style={{ fontSize: '14px', fontWeight: 'bold' }}>
                      Selected Files ({selectedFiles.length})
                    </p>
                    {selectedFiles.map((file, index) => (
                      <FileItem key={index}>
                        <span style={{ fontSize: '14px' }}>{file.name}</span>
                        <Button
                          variant="light"
                          size="sm"
                          isIconOnly
                          onPress={() => handleRemoveFile(index)}
                        >
                          <FiX />
                        </Button>
                      </FileItem>
                    ))}
                  </FileList>
                )}
              </UploadContainer>
            </TabsContent>

            <TabsContent value="txt">
              <UploadContainer>
                {!uploadProgress.isUploading && uploadProgress.total === 0 && (
                  <>
                    <FileInputLabel
                      htmlFor="txt-file-upload"
                      isDragOver={isDragOver && activeTab === 'txt'}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 'txt')}
                    >
                      <FiUpload size={32} />
                      <p style={{ marginTop: '0.5rem' }}>
                        {isDragOver
                          ? 'Drop files here'
                          : 'Click to select or drag TXT files'}
                      </p>
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#888',
                          marginTop: '0.25rem',
                        }}
                      >
                        Files will be automatically annotated before upload
                      </p>
                    </FileInputLabel>
                    <FileInput
                      ref={txtFileInputRef}
                      id="txt-file-upload"
                      type="file"
                      accept=".txt"
                      multiple
                      onChange={(e) => handleFileSelect(e, 'txt')}
                    />
                  </>
                )}

                {selectedFiles.length > 0 && !uploadProgress.isUploading && (
                  <FileList>
                    <p style={{ fontSize: '14px', fontWeight: 'bold' }}>
                      Selected Files ({selectedFiles.length})
                    </p>
                    {selectedFiles.map((file, index) => (
                      <FileItem key={index}>
                        <span style={{ fontSize: '14px' }}>{file.name}</span>
                        <Button
                          variant="light"
                          size="sm"
                          isIconOnly
                          onPress={() => handleRemoveFile(index)}
                        >
                          <FiX />
                        </Button>
                      </FileItem>
                    ))}
                  </FileList>
                )}
              </UploadContainer>
            </TabsContent>

            {uploadProgress.isUploading && (
              <div>
                <p style={{ fontSize: '14px', fontWeight: 'bold' }}>
                  {activeTab === 'txt'
                    ? 'Annotating and uploading documents...'
                    : 'Uploading documents...'}
                </p>
                <p
                  style={{
                    fontSize: '12px',
                    marginTop: '0.5rem',
                    color: '#666',
                  }}
                >
                  {uploadProgress.completed} of {uploadProgress.total} completed
                  {uploadProgress.failed > 0 &&
                    ` (${uploadProgress.failed} failed)`}
                </p>
                <Progress
                  value={progressPercentage}
                  color="primary"
                  css={{ marginTop: '1rem' }}
                />
              </div>
            )}

            {!uploadProgress.isUploading && uploadProgress.total > 0 && (
              <div>
                <p
                  style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#0a0',
                  }}
                >
                  Upload Complete!
                </p>
                <p style={{ fontSize: '12px', marginTop: '0.5rem' }}>
                  Successfully uploaded {uploadProgress.completed} of{' '}
                  {uploadProgress.total} documents
                  {uploadProgress.failed > 0 &&
                    ` (${uploadProgress.failed} failed)`}
                </p>
              </div>
            )}

            {uploadProgress.errors.length > 0 && (
              <ErrorList>
                <p
                  style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#c00',
                  }}
                >
                  Errors:
                </p>
                {uploadProgress.errors.map((error, index) => (
                  <ErrorItem key={index}>
                    <strong>{error.fileName}:</strong> {error.error}
                  </ErrorItem>
                ))}
              </ErrorList>
            )}
          </Tabs.Root>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="flat"
            onPress={handleClose}
            disabled={uploadProgress.isUploading}
          >
            {uploadProgress.isUploading ? 'Uploading...' : 'Close'}
          </Button>
          {selectedFiles.length > 0 && !uploadProgress.isUploading && (
            <Button
              color="primary"
              onPress={handleUpload}
              disabled={uploadProgress.isUploading}
            >
              Upload {selectedFiles.length} file
              {selectedFiles.length !== 1 ? 's' : ''}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default UploadDocumentsModal;
