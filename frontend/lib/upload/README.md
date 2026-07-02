# File Upload Job Management System

This is a comprehensive system for handling file uploads with persistent job tracking, progress notifications, and improved user experience.

## Features

✅ **Persistent Job IDs** - Each upload gets a unique job ID that persists across browser sessions  
✅ **Real-time Progress Tracking** - Track individual file progress with detailed statistics  
✅ **User Notifications** - Toast-style notifications for upload status updates  
✅ **Job History** - Keep track of recent uploads for user reference  
✅ **Error Handling** - Detailed error messages per file with automatic retry capability  
✅ **Background Processing** - Uploads continue without blocking the UI  
✅ **localStorage Persistence** - Job data survives page refreshes  

## Architecture

### 1. **Types** (`frontend/lib/upload/types.ts`)
Defines the core data structures:
- `UploadJob` - Represents a complete upload job
- `UploadJobFile` - Individual file metadata and status
- `UploadJobStatus` - Job lifecycle states (pending, processing, completed, failed, paused)
- Input types for creating and updating jobs

### 2. **Store** (`frontend/lib/upload/store.ts`)
In-memory job store with localStorage persistence:
- `UploadJobStore` - Singleton class managing all upload jobs
- Methods: `createJob()`, `getJob()`, `updateJobStatus()`, `updateFileStatus()`
- Automatically persists to localStorage for recovery

### 3. **State Management** (`frontend/atoms/uploadJobs.ts`)
Jotai atoms for reactive state:
- `currentUploadJobAtom` - Currently active job
- `uploadJobsHistoryAtom` - Recent job history
- `uploadNotificationsAtom` - Active notifications
- `uploadProgressAtom` - Progress tracking (backward compatible)

### 4. **Custom Hook** (`frontend/hooks/upload/useUploadJobs.ts`)
Main React hook for upload management:
- `createUploadJob()` - Start a new upload
- `processUploadJob()` - Process files and handle uploads
- `updateFileProgress()` - Update individual file status
- `cancelJob()` - Pause/cancel an upload
- `deleteJob()` - Remove job from history

### 5. **Notification Component** (`frontend/components/UploadNotificationCenter/`)
Toast-style notifications:
- Displays upload status updates
- Auto-dismisses after duration
- Color-coded by status (success, error, warning, info)

## Usage Example

### Basic Setup

1. **Add the notification component to your app layout** (`pages/_app.tsx` or root layout):

```tsx
import { UploadNotificationCenter } from '@/components/UploadNotificationCenter';

function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <UploadNotificationCenter />
    </>
  );
}
```

2. **Use the hook in your upload modal**:

```tsx
import { useUploadJobs } from '@/hooks/upload/useUploadJobs';

function UploadModal() {
  const { 
    createUploadJob, 
    processUploadJob,
    currentJob,
    jobHistory 
  } = useUploadJobs({
    onJobCompleted: (job) => {
      console.log('Upload completed:', job);
    },
    onJobFailed: (job) => {
      console.log('Upload failed:', job);
    },
  });

  const handleUpload = async () => {
    // Create a new job
    const job = createUploadJob({
      collectionId: 'my-collection-id',
      uploadType: 'txt',
      fileNames: ['file1.txt', 'file2.txt'],
      configuration: {
        toAnonymize: true,
        anonymizeTypes: ['PERSON', 'LOCATION'],
      },
    });

    // Prepare files
    const files = new Map();
    files.set('file1.txt', 'file content 1');
    files.set('file2.txt', 'file content 2');

    // Process the upload
    await processUploadJob(job, files, token);
  };

  return (
    <div>
      <button onClick={handleUpload}>Start Upload</button>
      {currentJob && (
        <div>
          Progress: {currentJob.statistics.completed}/{currentJob.statistics.total}
        </div>
      )}
    </div>
  );
}
```

## Job Lifecycle

```
pending → processing → completed (or failed)
          ↓
        paused (can be resumed)
```

### Job States

- **pending** - Job created, waiting to start
- **processing** - Currently uploading files
- **completed** - All files processed (may have some failures)
- **failed** - Job was cancelled
- **paused** - Temporarily suspended

### File States

- **pending** - Queued for upload
- **uploading** - Currently being uploaded
- **completed** - Successfully uploaded
- **failed** - Upload failed with error

## Integration with Existing Upload Modal

Update your existing `UploadDocumentsModal.tsx` to use the new job system:

```tsx
import { useUploadJobs } from '@/hooks/upload/useUploadJobs';

const handleUploadJSON = async () => {
  // Create job
  const job = createUploadJob({
    collectionId: collectionId || activeCollection?.id,
    uploadType: 'json',
    fileNames: selectedFiles.map(f => f.name),
    configuration: {
      toAnonymize,
      anonymizeTypes,
    },
  });

  // Prepare file contents
  const files = new Map<string, string>();
  for (const file of selectedFiles) {
    files.set(file.name, await file.text());
  }

  // Process upload
  await processUploadJob(job, files, tokenForApi);
};
```

## Persistence & Recovery

### localStorage Structure

Jobs are stored in localStorage under the key `upload_jobs`:

```json
[
  {
    "jobId": "job_1234567890_abc123def",
    "collectionId": "my-collection",
    "uploadType": "txt",
    "status": "completed",
    "files": [
      {
        "fileName": "document1.txt",
        "status": "completed",
        "progress": 100,
        "documentId": "doc_id_123"
      }
    ],
    "statistics": {
      "total": 1,
      "completed": 1,
      "failed": 0,
      "startedAt": 1234567890,
      "completedAt": 1234567900
    },
    "createdAt": 1234567890,
    "updatedAt": 1234567900
  }
]
```

### Accessing Job History

```tsx
const [jobHistory] = useAtom(uploadJobsHistoryAtom);

// Show recent uploads
jobHistory.forEach(job => {
  console.log(`Job ${job.jobId}: ${job.status}`);
});
```

## Advanced Features

### Custom Callbacks

```tsx
const { currentJob } = useUploadJobs({
  onJobCreated: (job) => {
    // Send to analytics
    trackEvent('upload_started', { jobId: job.jobId });
  },
  onJobCompleted: (job) => {
    // Refresh data, show success message
    refetchDocuments();
  },
  onJobFailed: (job) => {
    // Log errors for debugging
    logToSentry({ jobId: job.jobId, failures: job.files.filter(f => f.error) });
  },
});
```

### Job Cancellation

```tsx
const { cancelJob } = useUploadJobs();

// Cancel an active job
cancelJob(jobId);
```

### Job Deletion

```tsx
const { deleteJob } = useUploadJobs();

// Remove job from history
deleteJob(jobId);
```

## Backend Integration

The system expects your existing tRPC mutations to work:
- `document.createDocument` - for JSON uploads
- `document.annotateAndUpload` - for TXT uploads

The hook automatically calls these mutations with the appropriate parameters and handles responses.

## Future Enhancements

1. **Server-side Persistence** - Store jobs in MongoDB/PostgreSQL for cross-device access
2. **Resume Failed Uploads** - Retry mechanism for failed files
3. **Batch Operations** - Group multiple uploads
4. **Upload Speed Analytics** - Track performance metrics
5. **Chunked Uploads** - Support for large files with chunk-based uploading
6. **Concurrent File Processing** - Process multiple files in parallel
7. **Progress Webhooks** - Server-sent events for real-time updates

## Migration Guide

### From Simple Upload to Job-Based Upload

**Before:**
```tsx
// Simple sequential upload with local state
const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });

for (const file of files) {
  await createDocumentMutation.mutateAsync(data);
  setUploadProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
}
```

**After:**
```tsx
// Job-based upload with persistence
const { createUploadJob, processUploadJob } = useUploadJobs();

const job = createUploadJob({
  collectionId,
  uploadType: 'txt',
  fileNames: files.map(f => f.name),
});

const fileMap = new Map();
for (const file of files) {
  fileMap.set(file.name, await file.text());
}

await processUploadJob(job, fileMap, token);
```

## Troubleshooting

### Jobs Not Persisting

Ensure localStorage is enabled and not full. Check browser dev tools:
```js
localStorage.getItem('upload_jobs')
```

### Notifications Not Showing

Make sure `UploadNotificationCenter` is added to your app layout at the root level.

### Job Status Not Updating

Check browser console for errors. Verify that Jotai atoms are properly initialized.

## TypeScript Support

Full TypeScript support with proper typing:

```tsx
import type { UploadJob, CreateUploadJobInput } from '@/lib/upload/types';

const createUploadJob = (input: CreateUploadJobInput): UploadJob => {
  // Fully typed
};
```
