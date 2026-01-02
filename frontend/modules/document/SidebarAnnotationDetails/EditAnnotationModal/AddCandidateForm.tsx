import { Flex, useText } from '@/components';
import { useForm, useInput } from '@/hooks';
import styled from '@emotion/styled';
import { Button, Divider, FormElement, Input, Textarea } from '@heroui/react';
import { ChangeEvent, useState, Dispatch, SetStateAction } from 'react';
import { EntityAnnotation } from '@/server/routers/document';

const Container = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  borderRadius: '6px',
  border: '1px solid #0072F5',
  padding: '10px',
});

const Form = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  button: {
    marginRight: 'auto',
  },
});

const regexesKBs = [
  {
    regex: /(?:en|it)-?.wikipedia.org\/wiki\//,
    label: 'Wikipedia',
  },
  {
    regex: /dbpedia.org\/page/,
    label: 'DBPedia',
  },
  {
    regex: /geonames.org/,
    label: 'Geonames',
  },
];

const detectKB = (url: string) => {
  for (const r of regexesKBs) {
    if (url.match(r.regex)) {
      return r.label;
    }
  }
  return 'https://';
};

type AddCandidateLinkProps = {
  url: string;
  setUrl: (url: string) => void;
};

const AddCandidateLink = ({ url, setUrl }: AddCandidateLinkProps) => {
  const t = useText('document');
  const [label, setCurrentLabel] = useState<string>('https://');

  const handleChange = (event: ChangeEvent<FormElement>) => {
    const value = event.target.value;
    setCurrentLabel(detectKB(value));
    setUrl(value);
  };

  return (
    <Flex direction="row" gap="10px">
      <Input
        value={url}
        onChange={handleChange}
        labelLeft={label}
        placeholder="Resource link..."
        shadow={false}
        fullWidth
      />
    </Flex>
  );
};

import { useDocumentDispatch } from '../../DocumentProvider/selectors';
import { Candidate } from '@/server/routers/document';
import { message } from 'antd';

type AddCandidateFormProps = {
  annotation: EntityAnnotation;
  setAnnotation: Dispatch<SetStateAction<EntityAnnotation | undefined>>;
  setVisible: (value: boolean) => void;
};

type AddCandidateFormValues = {
  title: string;
  description: string;
};

const AddCandidateForm = ({
  annotation,
  setAnnotation,
  setVisible,
}: AddCandidateFormProps) => {
  const t = useText('document');
  const dispatch = useDocumentDispatch();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');

  const handleSubmit = () => {
    if (!title || !url) return;

    // Fill all required Candidate fields with defaults or dummy values
    const newCandidate: Candidate = {
      id: Date.now(), // or a better unique id if available
      indexer: 0,
      score: 0,
      raw_score: 0,
      norm_score: 0,
      title,
      url,
      // Optionally add other fields if needed (e.g., wikipedia_id)
    };

    const updatedCandidates = [
      ...(annotation.features.additional_candidates || []),
      newCandidate,
    ];

    setAnnotation({
      ...annotation,
      features: {
        ...annotation.features,
        additional_candidates: updatedCandidates,
      },
    });

    dispatch({
      type: 'editAnnotation',
      payload: {
        annotationId: annotation.id,
        topCandidate: annotation.features.top_candidate,
        types: [annotation.type, ...(annotation.features.types || [])],
        additional_candidates: updatedCandidates,
      },
    });
    message.success('Candidate added successfully');
    if (setVisible) setVisible(false);
  };

  return (
    <Container>
      <Flex>
        <span style={{ fontSize: '18px', lineHeight: 1.2 }}>
          {t('modals.editAnnotation.addCandidate.title')}
        </span>
        <span style={{ fontSize: '16px', color: 'rgba(0,0,0,0.5)' }}>
          {t('modals.editAnnotation.addCandidate.description')}
        </span>
      </Flex>
      <AddCandidateLink url={url} setUrl={setUrl} />
      <Divider />
      <Form>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="candidate-title"
          placeholder={t('modals.editAnnotation.addCandidate.candidateTitle')}
          shadow={false}
          fullWidth
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="candidate-description"
          placeholder={t(
            'modals.editAnnotation.addCandidate.candidateDescription'
          )}
          shadow={false}
          fullWidth
        />
        <Button auto onClick={handleSubmit}>
          {t('modals.editAnnotation.addCandidate.add')}
        </Button>
      </Form>
    </Container>
  );
};

export default AddCandidateForm;
