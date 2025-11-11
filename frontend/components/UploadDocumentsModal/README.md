# Upload Annotated Documents Feature

This feature allows users to upload multiple JSON documents with annotations through a modal interface on the homepage.

## Components

### UploadDocumentsModal
The main modal component that handles file selection and upload process.

**Features:**
- Multiple JSON file selection via click or drag & drop
- Drag and drop support from OS file explorer
- Visual feedback during drag operations
- File list with remove capability
- Upload progress tracking with progress bar
- Error handling and display
- Auto-close on successful upload

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

## Usage

### On Homepage
1. Click "Upload annotated documents" button
2. Select one or more JSON files by:
   - Clicking the upload area to open file browser, OR
   - Dragging files from your OS file explorer directly into the upload area
3. Review selected files (remove any if needed)
4. Click "Upload" button
5. Monitor progress

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

## Error Handling

- Invalid JSON files are caught and displayed in error list
- Failed uploads don't block other files
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
- Only `.json` files are accepted (non-JSON files are filtered out)
- Modal cannot be closed during active upload
- Upload state persists across page navigation
- Progress indicator only shows when modal is closed during upload
- Query cache is invalidated after all uploads complete (regardless of success/failure)