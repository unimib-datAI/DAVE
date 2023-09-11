import {
  AnnotationSet,
  Candidate,
  Cluster,
  Document,
  EntityAnnotation,
} from '@/server/routers/document';
import { FlatTreeNode, TreeItem } from '../../../components/Tree';
import { FlatTreeObj } from '../../../components/Tree';

export type Action =
  | { type: 'setData'; payload: { data: Document } }
  | {
      type: 'setCurrentEntityId';
      payload: { viewIndex: number; annotationId: number };
    }
  | { type: 'nextCurrentEntity' }
  | { type: 'createAnnotationSet'; payload: { name: string; preset: string } }
  | { type: 'deleteAnnotationSet'; payload: { name: string } }
  | {
      type: 'udpateAnnotationSets';
      payload: { annotationSets: AnnotationSet<EntityAnnotation>[] };
    }
  | { type: 'previousCurrentEntity' }
  | { type: 'highlightAnnotation'; payload: { annotationId: number | null } }
  | { type: 'changeAction'; payload: { action: UIAction } }
  | { type: 'changeActionData'; payload: { data: string } }
  | {
      type: 'addAnnotation';
      payload: {
        viewIndex: number;
        text: string;
        start: number;
        end: number;
        type: string;
      };
    }
  | {
      type: 'editAnnotation';
      payload: {
        annotationId: number;
        types: string[];
        topCandidate:
          | {
              url: string;
              title: string;
            }
          | undefined;
      };
    }
  | { type: 'deleteAnnotation'; payload: { viewIndex: number; id: number } }
  | { type: 'deleteTaxonomyType'; payload: { key: string } }
  | { type: 'addTaxonomyType'; payload: { type: FlatTreeNode } }
  | {
      type: 'changeAnnotationSet';
      payload: { viewIndex: number; annotationSet: string };
    }
  | { type: 'setView'; payload: { viewIndex: number; view: Partial<View> } }
  | { type: 'addView' }
  | { type: 'removeView' }
  | { type: 'setUI'; payload: Partial<State['ui']> };

export type ActionType = Action['type'];

export type Dispatch = (action: Action) => void;

export type AnnotationType = {
  label: string;
  color: string;
  children?: Record<string, Omit<AnnotationType, 'color'>>;
};
export type AnnotationTypeMap = Record<string, AnnotationType>;

export type UIAction =
  | 'select'
  | 'add'
  | 'delete'
  | 'clusters'
  | 'settings'
  | 'data';

export type Taxonomy = TreeItem[];
export type FlattenedTaxonomy = FlatTreeObj;

export type ProcessedCluster = Cluster & {
  mentions: {
    id: number;
    mention: string;
    mentionText: string;
  }[];
};

export type View = {
  typeFilter: string[];
  activeAnnotationSet: string;
  activeSection: string | undefined;
};

export type UIState = {
  /**
   * Taxonomy in tree structure
   */
  taxonomy: FlattenedTaxonomy;

  ui: {
    action: {
      value: UIAction;
      data?: string;
    };
    leftActionBarOpen: boolean;
    newAnnotationModalOpen: boolean;
    selectedEntity: {
      viewIndex: number;
      entityIndex: number;
    } | null;
    highlightAnnotation: {
      entityId: number | null;
    };
    views: View[];
  };
};

export type State = UIState & {
  /**
   * Document data
   */
  data: Document;
};
export type DocumentMetadataFeatures = {
  annoruolo: Number;
  annosentenza: Number;
  attestazione: String;
  cf_giudice: String;
  parte: String;
  codicegl: String;
  codiceoggetto: Number;
  codiceruolo: Number;
  codicesezione: String;
  codicestato: String;
  codiceufficio: Number;
  controparte: String;
  doc_meta_autore: String;
  do_meta_data_creazione: String;
  doc_meta_tipo: String;
  fascicoloprecedente_annoruolo: Number;
  fascicoloprecedente_annosentenza: Number;
  fascicoloprecedente_codiceufficio: Number;
  fascicoloprecedente_idfasc: Number;
  fascicoloprecedente_numeroruolo: Number;
  fascicoloprecedente_numerosentenza: Number;
  fascicoloprecedente_registro: Number;
  gradogiudizio: Number;
  id: String;
  idatto: Number;
  idfasc: Number;
  name: String;
  nomegiudice: String;
  numeroruolo: Number;
  numerosentenza: Number;
  title: String;
};
