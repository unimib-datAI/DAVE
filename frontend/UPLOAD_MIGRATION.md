# Migration Guide: Integrating Job-Based Upload System

This guide walks you through integrating the new upload job management system into your existing Next.js application.

## Step 1: Add Notification Component to Your App

Update your `pages/_app.tsx`:

```tsx
import { UploadNotificationCenter } from '@/components/UploadNotificationCenter';

function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <UploadProgressIndicator />
      <UploadNotificationCenter /> {/* Add this line */}
    </>
  );
}

export default App;
```

## Step 2: Update Your Upload Modal

### Option A: Minimal Changes (Keep Existing Modal Structure)

Modify your `UploadDocumentsModal.tsx` to use `useUploadJobs`:

```tsx
import { useUploadJobs } from '@/hooks/upload/useUploadJobs';

export const UploadDocumentsModal = ({ collectionId, doneUploading }: props) => {
  // ... existing state ...
  
  const { createUploadJob, processUploadJob } = useUploadJobs({
    onJobCompleted: () => {
      setTimeout(() => {
        handleClose();
        if (doneUploading) {
          doneUploading();
        }
      }, 1500);
    },
  });

  const handleUploadJSON = async () => {
    if (selectedFiles.length === 0) return;
    if (activeCollection === undefined || activeCollection === null) {
      message.error('No active collection to upload the documents to');
      return;
    }

    // Create upload job
    const job = createUploadJob({
      collectionId: collectionId || activeCollection?.id,
      uploadType: 'json',
      fileNames: selectedFiles.map(f => f.name),
      configuration: {
        toAnonymize,
        anonymizeTypes: anonymizeTypes.length > 0 ? anonymizeTypes : undefined,
      },
    });

    // Prepare files
    const files = new Map<string, string>();
    for (const file of selectedFiles) {
      try {
        const content = await file.text();
        files.set(file.name, content);
      } catch (error) {
        console.error('Error reading file:', error);
      }
    }

    // Process upload
    await processUploadJob(job, files, tokenForApi);
  };

  const handleUploadTXT = async () => {
    if (selectedFiles.length === 0) return;

    // Create upload job
    const job = createUploadJob({
      collectionId: collectionId || activeCollection?.id,
      uploadType: 'txt',
      fileNames: selectedFiles.map(f => f.name),
      configuration: {
        configurationId: selectedConfigId || undefined,
        toAnonymize,
        anonymizeTypes: anonymizeTypes.length > 0 ? anonymizeTypes : undefined,
      },
    });

    // Prepare files
    const files = new Map<string, string>();
    for (const file of selectedFiles) {
      try {
        const content = await file.text();
        files.set(file.name, content);
      } catch (error) {
        console.error('Error reading file:', error);
      }
    }

    // Process upload
    await processUploadJob(job, files, tokenForApi);
  };

  // ... rest of component unchanged ...
};
```

### Option B: Full Refactor (Recommended for New Code)

Create a new `EnhancedUploadDocumentsModal.tsx`:

```tsx
import React, { useState, useRef } from 'react';
import { useAtom } from 'jotai';
import { useUploadJobs } from '@/hooks/upload/useUploadJobs';
import { activeCollectionAtom } from '@/atoms/collection';
import { useSession } from 'next-auth/react';
import { Modal, Button, Progress } from '@heroui/react';

interface EnhancedUploadDocumentsModalProps {
  collectionId?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export const EnhancedUploadDocumentsModal: React.FC<
  EnhancedUploadDocumentsModalProps
> = ({ collectionId, isOpen, onOpenChange, onComplete }) => {
  const { data: session } = useSession();
  const [activeCollection] = useAtom(activeCollectionAtom);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadType, setUploadType] = useState<'json' | 'txt'>('json');

  const { createUploadJob, processUploadJob, currentJob } = useUploadJobs({
    onJobCompleted: () => {
      setTimeout(() => {
        handleClose();
        onComplete?.();
      }, 1500);
    },
  });

  const handleUpload = async () => {
    const collection = collectionId || activeCollection?.id;
    if (!collection) {
      alert('No active collection selected');
      return;
    }

    if (selectedFiles.length === 0) {
      alert('Please select files to upload');
      return;
    }

    // Create job
    const job = createUploadJob({
      collectionId: collection,
      uploadType,
      fileNames: selectedFiles.map(f => f.name),
    });

    // Read files
    const fileMap = new Map<string, string>();
    for (const file of selectedFiles) {
      const content = await file.text();
      fileMap.set(file.name, content);
    }

    // Process
    const token = (session?.accessToken as string) || '';
    await processUploadJob(job, fileMap, token);
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedFiles([]);
  };

  const progressPercentage =
    currentJob && currentJob.statistics.total > 0
      ? (currentJob.statistics.completed / currentJob.statistics.total) * 100
      : 0;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader>Upload Documents</ModalHeader>
        <ModalBody>
          {/* Your file input UI */}
          <input
            type="file"
            multiple
            onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
          />

          {currentJob && (
            <div>
              <Progress value={progressPercentage} />
              <p>
                {currentJob.statistics.completed}/{currentJob.statistics.total}{' '}
                files uploaded
              </p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button onPress={handleClose}>Cancel</Button>
          <Button onPress={handleUpload} color="primary">
            Upload
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
```

## Step 3: Access Job History (Optional)

Create a new component to show upload history:

```tsx
import { useAtom } from 'jotai';
import { uploadJobsHistoryAtom } from '@/atoms/uploadJobs';

export const UploadHistory = () => {
  const [jobHistory] = useAtom(uploadJobsHistoryAtom);
  const { deleteJob } = useUploadJobs();

  return (
    <div>
      <h3>Recent Uploads</h3>
      {jobHistory.map((job) => (
        <div key={job.jobId}>
          <p>{job.collectionId}</p>
          <p>
            Status: {job.status} ({job.statistics.completed}/
            {job.statistics.total} completed)
          </p>
          <button onClick={() => deleteJob(job.jobId)}>Delete</button>
        </div>
      ))}
    </div>
  );
};
```

## Step 4: Type Safety

Ensure you're importing types correctly:

```tsx
import type { UploadJob, CreateUploadJobInput } from '@/lib/upload/types';
import type { UseUploadJobsOptions } from '@/hooks/upload';
```

## Step 5: Testing

### Test Job Creation
```tsx
const { createUploadJob } = useUploadJobs();

const job = createUploadJob({
  collectionId: 'test-collection',
  uploadType: 'json',
  fileNames: ['test.json'],
});

console.log(job.jobId); // Should be defined
```

### Test Persistence
```tsx
// Upload a file, refresh the page
localStorage.getItem('upload_jobs');
// Should contain your job data
```

### Test Notifications
- Notifications should appear at top-right
- Auto-dismiss after duration
- Should show success, error, warning, and info types

## Backward Compatibility

The old `uploadProgressAtom` still works! It's automatically updated by `useUploadJobs`:

```tsx
import { useAtom } from 'jotai';
import { uploadProgressAtom } from '@/atoms/upload';

// Old code still works
const [uploadProgress] = useAtom(uploadProgressAtom);
console.log(uploadProgress.completed, uploadProgress.total);
```

## Troubleshooting

### Issue: Mutations are undefined

**Solution**: Make sure you're using the correct mutation names:
- `document.createDocument` - Check your tRPC router
- `document.annotateAndUpload` - Check your tRPC router

### Issue: localStorage quota exceeded

**Solution**: Increase storage or implement cleanup:
```tsx
// Clear old jobs (> 30 days)
const store = getUploadJobStore();
const recentJobs = store.getRecentJobs(20);
store.clearAllJobs();
recentJobs.forEach(job => store.createJob(job));
```

### Issue: Notifications not showing

**Solution**: Ensure `UploadNotificationCenter` is at root level and z-index isn't blocked.

## Performance Considerations

1. **Sequential Processing**: Files are uploaded one at a time to prevent server overload
2. **Memory Usage**: File contents are stored in memory temporarily
3. **localStorage Size**: Keep job history to ~20 jobs max

For large files or many concurrent uploads, consider:
- Chunked uploads (future feature)
- Parallel processing with a queue
- Server-side job management

## Next Steps

1. ✅ Add notification component to app
2. ✅ Update upload modal with job creation
3. ✅ Test with your existing upload flow
4. ✅ Add upload history component (optional)
5. ⭐ Consider server-side persistence for production

## Support & Questions

Refer to `frontend/lib/upload/README.md` for detailed API documentation.
