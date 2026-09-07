# Jotai State Reference

## Global Atoms

### `utils/atoms.ts`

| Atom | Type | Storage |
|---|---|---|
| `globalAnonymizationAtom` | `boolean` | localStorage `'globalAnonymization'` |
| `deanonymizeFacetsAtom` | `boolean` (derived — inverse of above) | — |
| `anonimizedNamesAtom` | `boolean` | memory |
| `isLoadingAnonymizationAtom` | `boolean` | memory |
| `deanonymizedFacetNamesAtom` | `Record<string, string>` | memory |
| `documentPageAtom` | `number` | memory |
| `documentTextAtom` | `string` | memory |
| `facetsDocumentsAtom` | `FacetedQueryHit[]` | memory |
| `selectedFiltersAtom` | `SelectedFilter[]` | memory |

`SelectedFilter` → `{ id_ER: string; display_name: string }`

---

### `atoms/annotationConfig.ts`

| Atom | Type | Storage |
|---|---|---|
| `annotationSelectedServicesAtom` | `PipelineStep[]` | localStorage `'annotation-pipeline-steps'` |

`PipelineStep` → `{ id?: string; name: string; uri: string; serviceType?: string }`

---

### `atoms/annotations.ts`

| Atom | Type | Storage |
|---|---|---|
| `annotationsAtom` | `Record<string, Annotation[]>` | localStorage `'document-annotations'` |

`Annotation` →
```ts
{
  id: number
  id_ER?: string
  start: number
  end: number
  type: string
  mention: string
  is_linked?: boolean
  display_name?: string
  anonymize?: boolean
  to_delete?: boolean
}
```

---

### `atoms/collection.ts`

| Atom | Type | Storage |
|---|---|---|
| `activeCollectionAtom` | `Collection \| null` | localStorage `'activeCollection'` |
| `collectionsAtom` | `Collection[]` | memory |

`Collection` →
```ts
{
  id: string
  name: string
  ownerId: string
  allowedUserIds: string[]
  createdAt: string
  updatedAt: string
  config: {
    typesToHide: string[]
    typesOrder?: string[]
  }
}
```

---

### `atoms/llmSettings.ts`

| Atom | Type | Storage |
|---|---|---|
| `llmSettingsAtom` | `LLMSettings` | memory (base) |
| `persistedLLMSettingsAtom` | `LLMSettings` (derived writable) | encrypted localStorage |
| `loadLLMSettingsAtom` | write-only action | reads encrypted localStorage |
| `clearLLMSettingsAtom` | write-only action | clears encrypted localStorage |

`LLMSettings` →
```ts
{
  baseURL: string
  apiKey: string
  model: string
  useCustomSettings: boolean
  enableMessageHistory: boolean
  defaultTemperature: number
  defaultMaxTokens: number
  defaultTopP: number
  defaultTopK: number
  defaultFrequencyPenalty: number
  defaultSystemPrompt: string
}
```

---

### `atoms/upload.ts`

| Atom | Type | Storage |
|---|---|---|
| `uploadProgressAtom` | `UploadProgress` | memory |
| `uploadModalOpenAtom` | `boolean` | memory |

`UploadProgress` →
```ts
{
  total: number
  completed: number
  failed: number
  isUploading: boolean
  errors: Array<{ fileName: string; error: string }>
}
```

---

## Module Atoms

### Document module — `documentStateAtom`

> Lives in an **isolated Jotai store** (one per open document). `globalAnonymizationAtom` is synced into this store on mount.

**`State`**
```ts
{
  taxonomy: FlattenedTaxonomy       // Record<key, FlatTreeNode>
  data: Document
  ui: {
    action: {
      value: UIAction               // 'select' | 'add' | 'delete' | 'clusters' | 'settings' | 'data'
      data?: string
    }
    leftActionBarOpen: boolean
    newAnnotationModalOpen: boolean
    selectedEntity: { viewIndex: number; entityIndex: number } | null
    highlightAnnotation: { entityId: number | null }
    views: View[]
  }
}
```

**`View`**
```ts
{
  typeFilter: string[]
  activeAnnotationSet: string
  activeSection: string | undefined
}
```

**`Document`**
```ts
{
  id: string
  text: string
  annotation_sets: AnnotationSet[]
  metadata: DocumentMetadataFeatures
}
```

**`FlatTreeNode`** (taxonomy entry)
```ts
{
  key: string
  label: string
  color: string
  children?: string[]
  terms?: string[]
}
```

**Reducer actions** (`Action` union):
- `setData` · `setCurrentEntityId` · `nextCurrentEntity` · `previousCurrentEntity`
- `highlightAnnotation` · `changeAction` · `changeActionData`
- `addAnnotation` · `editAnnotation` · `deleteAnnotation`
- `addTaxonomyType` · `deleteTaxonomyType`
- `createAnnotationSet` · `deleteAnnotationSet` · `udpateAnnotationSets` · `changeAnnotationSet`
- `setView` · `addView` · `removeView`
- `setUI`

---

### Chat module — `chatStateAtom`

**`State`**
```ts
{
  messages: Message[]
  contexts: (DocumentWithChunk[] | undefined)[]
  statuses: (boolean | undefined)[]
  conversationRated: boolean
}
```

**Reducer actions** (`Action` union):
- `setMessages` · `addMessage` · `updateMessage` · `clearMessages`
- `setContext` · `setStatus`
- `setConversationRated` · `resetChat`

---

### Taxonomy module — `taxonomyStateAtom`

**`State`**
```ts
{
  taxonomy: FlatTreeObj   // Record<key, FlatTreeNode>
}
```

**Reducer actions** (`Action` union):
- `setTaxonomy` · `addType` · `editType` · `deleteType`

---

### Review module — `ReviewProvider` (context-based, not a top-level atom)

**`State`**
```ts
{
  id: string
  docId: string
  doneIds: string[]
  name: string
  total: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  currentDocument: Document | undefined
  isLoading: boolean
  ui: {
    totalReviewed: number
    currentItemCursor: number
    lastItemCursor: number
  }
}
```

**Reducer actions** (`Action` union):
- `setState` · `updateTime` · `setActiveItem`
- `addCandidateOptionItem` · `nextAnnotation` · `prevAnnotation`
- `skipAnnotation` · `nilAnnotation` · `confirmAnnotation`
