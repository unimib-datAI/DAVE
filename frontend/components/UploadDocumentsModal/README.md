# Upload Documents Feature

This feature allows users to upload documents through a modal interface on the homepage. It supports two types of uploads:
1. **JSON Documents**: Pre-annotated documents in JSON format
2. **Plain Text Documents**: Raw text files that will be automatically annotated before upload

## Components

### UploadDocumentsModal
The main modal component that handles file selection and upload process with tabbed interface.

**Features:**
- Two-tab interface for JSON and TXT file uploads
- Multiple file selection via click or drag & drop
- Drag and drop support from OS file explorer
- Visual feedback during drag operations
- File list with remove capability
- Upload progress tracking with progress bar
- Error handling and display
- Auto-close on successful upload
- Automatic annotation pipeline for plain text files

### UploadProgressIndicator
A floating indicator that appears in the bottom-right corner when uploads are in progress and the modal is closed.

**Features:**
- Shows upload progress outside the modal
- Clickable to reopen the modal
- Automatically disappears when upload completes
- Displays error count if any uploads fail

## State Management

Uses Jotai atoms for global state:
- `uploadModalOpenAtom`: Controls modal visibility
- `uploadProgressAtom`: Tracks upload progress including:
  - Total files
  - Completed count
  - Failed count
  - Upload status
  - Error details

## Tabs

### JSON Documents Tab
Upload pre-annotated documents in JSON format with existing annotation sets and features.

**Accepts:** `.json` files  
**Processing:** Direct upload to backend

### Plain Text Documents Tab
Upload raw text files that will be automatically processed through the annotation pipeline.

**Accepts:** `.txt` files  
**Processing:** 
1. SpaCy NER annotation
2. BLINK biencoder mention detection
3. Indexer entity search
4. NIL prediction
5. NIL clustering
6. Encoding cleanup
7. Upload to backend

## API Integration

### TRPC Mutation: `document.createDocument`

**Input:**
```typescript
{
  document: {
    text: string;
    annotation_sets: Record<string, any>;
    preview?: string;
    name?: string;
    features?: Record<string, any>;
    offset_type?: string;
  }
}
```

**Behavior:**
- Takes a JSON document with annotations
- Automatically includes `elasticIndex` from environment variable
- Sends POST request to `/document` endpoint
- Returns created document or throws error

### TRPC Mutation: `document.annotateAndUpload`

**Input:**
```typescript
{
  text: string;
  name?: string;
}
```

**Behavior:**
- Takes plain text content
- Processes through annotation pipeline sequentially:
  1. SpaCy NER - Named Entity Recognition
  2. BLINK Biencoder - Entity mention detection
  3. Indexer Search - Entity search in knowledge base
  4. NIL Prediction - NIL entity prediction
  5. NIL Clustering - Groups NIL entities
  6. Encoding Cleanup - Removes encoding features from linking data
- Creates gatenlp Document format
- Each step passes its output to the next step
- Finally uploads the fully annotated document to the backend
- Returns created document or throws error

**Pipeline URLs:**
The URLs for each annotation service are configurable via environment variables. See [Environment Variables Documentation](../../docs/ENVIRONMENT_VARIABLES.md) for details:
- `ANNOTATION_SPACYNER_URL` (default: `http://10.0.0.108:13221/api/spacyner`)
- `ANNOTATION_BLINK_URL` (default: `http://10.0.0.108:13224/api/blink/biencoder/mention/doc`)
- `ANNOTATION_INDEXER_URL` (default: `http://10.0.0.108:13223/api/indexer/search/doc`)
- `ANNOTATION_NILPREDICTION_URL` (default: `http://10.0.0.108:13225/api/nilprediction/doc`)
- `ANNOTATION_NILCLUSTER_URL` (default: `http://10.0.0.108:13226/api/nilcluster/doc`)

## Usage

### Uploading JSON Documents
1. Click "Upload annotated documents" button
2. Select "JSON Documents" tab (default)
3. Select one or more JSON files by:
   - Clicking the upload area to open file browser, OR
   - Dragging files from your OS file explorer directly into the upload area
4. Review selected files (remove any if needed)
5. Click "Upload" button
6. Monitor progress

### Uploading Plain Text Documents
1. Click "Upload annotated documents" button
2. Select "Plain Text Documents" tab
3. Select one or more TXT files by:
   - Clicking the upload area to open file browser, OR
   - Dragging files from your OS file explorer directly into the upload area
4. Review selected files (remove any if needed)
5. Click "Upload" button
6. Monitor progress (annotation pipeline + upload)

**Note:** Plain text uploads take longer as they go through the complete annotation pipeline.

### Background Upload
- Upload continues even if you navigate to other pages
- Floating indicator shows progress when modal is closed
- Click indicator to reopen modal and see details

## JSON Document Format

Documents should follow this structure:
```json
{
  "text": "Document text content",
  "annotation_sets": {
    "entities": {
      "name": "entities",
      "annotations": [...]
    }
  },
  "preview": "Optional preview text",
  "name": "Optional document name",
  "features": {},
  "offset_type": "Optional offset type"
}
```

## Plain Text Document Format

Simple `.txt` files containing raw text. The filename (without extension) will be used as the document name.

## Error Handling

- Invalid JSON files are caught and displayed in error list
- Failed uploads don't block other files
- Annotation pipeline errors are caught and reported
- All errors are collected and shown to user
- Progress bar reflects only successful uploads

## Cache Invalidation

After successful document uploads, the component automatically invalidates query caches for:
- `search.facetedSearch` - Ensures search results show newly uploaded documents
- `document.inifniteDocuments` - Ensures document lists are refreshed

This prevents stale data from being displayed when navigating back to search/document pages after uploading new documents.

## Implementation Notes

- Files are processed sequentially to avoid overwhelming the server
- Drag and drop area changes appearance when files are dragged over it (blue border and background)
- JSON tab only accepts `.json` files; TXT tab only accepts `.txt` files
- Modal cannot be closed during active upload
- Upload state persists across page navigation
- Progress indicator only shows when modal is closed during upload
- Query cache is invalidated after all uploads complete (regardless of success/failure)
- Switching tabs clears selected files
- Each tab has its own file input and drag-drop area
- Annotation pipeline for TXT files runs on the server side to ensure consistency
- Annotation service URLs are configurable via environment variables (see [Environment Variables](../../docs/ENVIRONMENT_VARIABLES.md))