import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Progress,
  Checkbox,
  Input,
} from '@heroui/react';
import { useAtom } from 'jotai';
import { uploadModalOpenAtom, uploadProgressAtom } from '@/atoms/upload';

import { useMutation, useContext, useQuery } from '@/utils/trpc';
import { useRef, useState, useEffect } from 'react';
import styled from '@emotion/styled';
import { FiUpload } from '@react-icons/all-files/fi/FiUpload';
import { FiX } from '@react-icons/all-files/fi/FiX';
import * as Tabs from '@radix-ui/react-tabs';
import { activeCollectionAtom } from '@/atoms/collection';
import { message, Select } from 'antd';
import { useSession } from 'next-auth/react';
import { useText } from '@/components/TranslationProvider';

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
const UploadDocumentsModal = ({ collectionId, doneUploading }: props) => {
  const t = useText('uploadModal');
  const [isOpen, setIsOpen] = useAtom(uploadModalOpenAtom);
  const { data: session, status } = useSession();
  const [uploadProgress, setUploadProgress] = useAtom(uploadProgressAtom);
  const [activeCollection] = useAtom(activeCollectionAtom);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'json' | 'txt'>('json');
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [toAnonymize, setToAnonymize] = useState(false);
  const [anonymizeTypes, setAnonymizeTypes] = useState<string[]>([]);
  const [anonymizeTypesInput, setAnonymizeTypesInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jsonEntityTypes, setJsonEntityTypes] = useState<string[]>([]);
  const [loadingJsonEntityTypes, setLoadingJsonEntityTypes] = useState(false);
  // Sync input value with anonymizeTypes state
  useEffect(() => {
    setAnonymizeTypesInput(anonymizeTypes.join(', '));
  }, [anonymizeTypes]);
  const txtFileInputRef = useRef<HTMLInputElement>(null);
  const createDocumentMutation = useMutation(['document.createDocument']);
  const annotateAndUploadMutation = useMutation(['document.annotateAndUpload']);
  const trpcContext = useContext();
  const token = session?.accessToken as string | undefined;
  const authDisabled = process.env.NEXT_PUBLIC_USE_AUTH === 'false';
  // When auth is disabled, pass an empty string token to satisfy backend schema validation.
  const tokenForApi = token ?? '';

  // Fetch configurations
  const { data: configurations = [], isLoading: configurationsLoading } =
    useQuery(['document.getConfigurations', { token: tokenForApi }], {
      enabled: authDisabled || (status === 'authenticated' && !!token),
    });

  // Get active configuration
  const { data: activeConfig, isLoading: activeConfigLoading } = useQuery(
    ['document.getActiveConfiguration', { token: tokenForApi }],
    {
      enabled: authDisabled || (status === 'authenticated' && !!token),
    }
  );

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
      // For JSONs, extract entity types immediately when selecting via file input
      if (fileType === 'json') {
        getEntityTypesFromJson(
          filteredFiles.filter((file) => file.name.endsWith('.json'))
        );
      }
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
  const getEntityTypesFromJson = async (files: File[]) => {
    setLoadingJsonEntityTypes(true);
    let typesArray: string[] = [];
    let x = 1;
    for (const file of files) {
      console.log(`processing file n. ${x}`);
      try {
        const text = await file.text();
        const jsonFile = JSON.parse(text);
        if (jsonFile.annotation_sets) {
          for (const key of Object.keys(jsonFile.annotation_sets)) {
            if (jsonFile.annotation_sets[key].annotations) {
              const annotationsArray: any[] =
                jsonFile.annotation_sets[key].annotations;
              annotationsArray.forEach((annotation) => {
                if (!typesArray.includes(annotation.type)) {
                  typesArray.push(annotation.type);
                }
              });
            } else {
              continue;
            }
          }
        }
      } catch (err) {
        console.error('error getting entity types', err);
      }
      x += 1;
    }
    console.log('fount entity types from json files', typesArray);
    setJsonEntityTypes(typesArray);
    setLoadingJsonEntityTypes(false);
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
      getEntityTypesFromJson(
        filteredFiles.filter((file) => file.name.endsWith('.json'))
      );
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
          console.log('access token', tokenForApi);
          await createDocumentMutation.mutateAsync({
            document: jsonData,
            collectionId: collectionId || activeCollection?.id,
            token: tokenForApi,
            toAnonymize,
            anonymizeTypes:
              anonymizeTypes.length > 0 ? anonymizeTypes : undefined,
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

        // Backend fetches configuration - either selected or active
        await annotateAndUploadMutation.mutateAsync({
          text,
          name: file.name.replace('.txt', ''),
          collectionId: collectionId || activeCollection?.id,
          token: tokenForApi,
          configurationId: selectedConfigId || undefined,
          toAnonymize,
          anonymizeTypes:
            anonymizeTypes.length > 0 ? anonymizeTypes : undefined,
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
      setToAnonymize(false);
      setAnonymizeTypes([]);
      setAnonymizeTypesInput('');
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
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader>
              <strong style={{ fontSize: 18 }}>{t('header')}</strong>
            </ModalHeader>
            <ModalBody>
              <div style={{ marginBottom: '1rem' }}>
                <Checkbox
                  checked={toAnonymize}
                  onChange={(e: any) =>
                    setToAnonymize(Boolean(e?.target?.checked ?? e))
                  }
                >
                  {t('anonymize')}
                </Checkbox>
                {toAnonymize && (
                  <div style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
                    <span style={{ display: 'block', marginBottom: '0.25rem' }}>
                      {t('anonymizeTypesLabel')}
                    </span>

                    {activeTab === 'json' ? (
                      // Ant Design Select for JSON tab
                      <Select
                        mode="multiple"
                        placeholder={t('anonymizeTypesPlaceholder')}
                        value={anonymizeTypes}
                        onChange={(values: any) => {
                          const vals = Array.isArray(values)
                            ? values
                            : [values];
                          setAnonymizeTypes(vals as string[]);
                          setAnonymizeTypesInput((vals as string[]).join(', '));
                        }}
                        loading={loadingJsonEntityTypes}
                        allowClear
                        style={{ width: '100%' }}
                        options={jsonEntityTypes.map((type) => ({
                          label: type,
                          value: type,
                        }))}
                        getPopupContainer={(trigger) =>
                          trigger.parentElement || document.body
                        }
                        dropdownStyle={{ zIndex: 10000 }}
                      />
                    ) : (
                      <>
                        <Input
                          placeholder={t('anonymizeTypesPlaceholder')}
                          value={anonymizeTypesInput}
                          onChange={(e) =>
                            setAnonymizeTypesInput(e.target.value)
                          }
                          onBlur={() => {
                            const types = anonymizeTypesInput
                              .split(',')
                              .map((type) => type.trim())
                              .filter((type) => type.length > 0);
                            setAnonymizeTypes(types);
                          }}
                          style={{ width: '100%' }}
                        />
                        <span
                          style={{
                            fontSize: 10,
                            color: '#666',
                            marginTop: '0.25rem',
                            display: 'block',
                          }}
                        >
                          {t('anonymizeTypesHelp')}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
                <TabsList>
                  <TabsTrigger value="json">{t('tabs.json')}</TabsTrigger>
                  <TabsTrigger value="txt">{t('tabs.txt')}</TabsTrigger>
                </TabsList>

                <TabsContent value="json">
                  <UploadContainer>
                    {!uploadProgress.isUploading &&
                      uploadProgress.total === 0 && (
                        <>
                          <FileInputLabel
                            htmlFor="json-file-upload"
                            isDragOver={isDragOver && activeTab === 'json'}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'json')}
                          >
                            <FiUpload size={32} />
                            <span
                              style={{ marginTop: '0.5rem', display: 'block' }}
                            >
                              {isDragOver
                                ? t('jsonTab.dropFiles')
                                : t('jsonTab.clickSelect')}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: '#888',
                                marginTop: '0.25rem',
                                display: 'block',
                              }}
                            >
                              {t('jsonTab.description')}
                            </span>
                          </FileInputLabel>
                          <FileInput
                            ref={fileInputRef}
                            id="upload-file-input"
                            data-testid="upload-file-input"
                            type="file"
                            accept=".json"
                            multiple
                            onChange={(e) => handleFileSelect(e, 'json')}
                          />
                        </>
                      )}

                    {selectedFiles.length > 0 &&
                      !uploadProgress.isUploading && (
                        <FileList>
                          <strong style={{ fontSize: 14 }}>
                            {t('selectedFiles', { n: selectedFiles.length })}
                          </strong>
                          {selectedFiles.map((file, index) => (
                            <FileItem
                              data-testid="upload-file-item"
                              key={index}
                            >
                              <span style={{ fontSize: 14 }}>{file.name}</span>
                              <Button onPress={() => handleRemoveFile(index)}>
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
                    <div style={{ marginBottom: '1rem' }}>
                      <strong
                        style={{
                          fontSize: 14,
                          marginBottom: '0.5rem',
                          display: 'block',
                        }}
                      >
                        {t('txtTab.configLabel')}
                      </strong>
                      <Select
                        style={{ width: '100%' }}
                        placeholder={t('txtTab.configPlaceholder')}
                        value={selectedConfigId}
                        onChange={(value) => setSelectedConfigId(value)}
                        allowClear
                        getPopupContainer={(trigger) =>
                          trigger.parentElement || document.body
                        }
                        dropdownStyle={{ zIndex: 10000 }}
                        options={[
                          ...(activeConfig
                            ? [
                                {
                                  label: `${activeConfig.name} (Active)`,
                                  value: activeConfig._id,
                                },
                              ]
                            : []),
                          ...configurations
                            .filter((c: any) => c._id !== activeConfig?._id)
                            .map((config: any) => ({
                              label: config.name,
                              value: config._id,
                            })),
                        ]}
                      />
                      <span
                        style={{
                          color: '#666',
                          marginTop: '0.25rem',
                          display: 'block',
                        }}
                      >
                        {selectedConfigId
                          ? t('txtTab.configText', {
                              name:
                                configurations.find(
                                  (c: any) => c._id === selectedConfigId
                                )?.name || 'Selected',
                            })
                          : activeConfig
                          ? t('txtTab.configActive', {
                              name: activeConfig.name,
                            })
                          : t('txtTab.configDefault')}
                      </span>
                    </div>

                    {!uploadProgress.isUploading &&
                      uploadProgress.total === 0 && (
                        <>
                          <FileInputLabel
                            htmlFor="txt-file-upload"
                            isDragOver={isDragOver && activeTab === 'txt'}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, 'txt')}
                          >
                            <FiUpload size={32} />
                            <span
                              style={{ marginTop: '0.5rem', display: 'block' }}
                            >
                              {isDragOver
                                ? t('txtTab.dropFiles')
                                : t('txtTab.clickSelect')}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: '#888',
                                marginTop: '0.25rem',
                                display: 'block',
                              }}
                            >
                              {t('txtTab.description')}
                            </span>
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

                    {selectedFiles.length > 0 &&
                      !uploadProgress.isUploading && (
                        <FileList>
                          <strong style={{ fontSize: 14 }}>
                            {t('selectedFiles', { n: selectedFiles.length })}
                          </strong>
                          {selectedFiles.map((file, index) => (
                            <FileItem
                              data-testid="upload-file-item"
                              key={index}
                            >
                              <span style={{ fontSize: 14 }}>{file.name}</span>
                              <Button onPress={() => handleRemoveFile(index)}>
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
                    <strong style={{ fontSize: 14 }}>
                      {activeTab === 'txt'
                        ? t('uploading.txt')
                        : t('uploading.json')}
                    </strong>
                    <Progress
                      value={progressPercentage}
                      color="primary"
                      style={{ marginTop: '1rem' }}
                    />
                  </div>
                )}

                {!uploadProgress.isUploading && uploadProgress.total > 0 && (
                  <div id="upload-complete">
                    <strong style={{ color: '#0a0', fontSize: 14 }}>
                      {t('complete')}
                    </strong>
                    <span style={{ display: 'block', marginTop: '0.5rem' }}>
                      {t('success', {
                        completed: uploadProgress.completed,
                        total: uploadProgress.total,
                        failed: uploadProgress.failed,
                      })}
                    </span>
                  </div>
                )}

                {uploadProgress.errors.length > 0 && (
                  <div data-testid="upload-error-list">
                    <strong style={{ color: '#c00', fontSize: 14 }}>
                      {t('errors')}
                    </strong>
                    {uploadProgress.errors.map((error, index) => (
                      <div data-testid="upload-error-item" key={index}>
                        <strong>{error.fileName}:</strong> {error.error}
                      </div>
                    ))}
                  </div>
                )}
              </Tabs.Root>
            </ModalBody>
            <ModalFooter>
              <Button
                onPress={handleClose}
                isDisabled={uploadProgress.isUploading}
              >
                {uploadProgress.isUploading
                  ? t('buttons.uploading')
                  : t('buttons.close')}
              </Button>
              {selectedFiles.length > 0 && !uploadProgress.isUploading && (
                <Button
                  id="submitUploadButton"
                  onPress={handleUpload}
                  isDisabled={uploadProgress.isUploading}
                >
                  {t('buttons.upload', { n: selectedFiles.length })}
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default UploadDocumentsModal;
