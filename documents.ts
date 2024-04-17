type Document = {
  id: string;
  title: string;
  content: string;
  annotation: string;
};

/**
 * Collection of documents
 */
export const DOCUMENTS: Record<string, Document> = {
  '2000': {
    id: '2000',
    title: 'Sentenza strage di Bologna',
    content: 'bologna.txt',
    annotation: 'bologna.json',
  },
};
