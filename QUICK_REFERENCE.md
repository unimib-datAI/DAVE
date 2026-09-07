# Quick Reference Guide - File Upload System

## 🚀 30-Second Setup

```tsx
// 1. Add to _app.tsx
import { UploadNotificationCenter } from '@/components/UploadNotificationCenter';

function App() {
  return (
    <>
      <YourApp />
      <UploadNotificationCenter />
    </>
  );
}

// 2. Use in your component
import { useUploadJobs } from '@/hooks/upload/useUploadJobs';

const { createUploadJob, processUploadJob } = useUploadJobs({
  onJobCompleted: (job) => console.log('Done!'),
});

// 3. Create and process jobs
const job = createUploadJob({
  collectionId: 'my-collection',
  uploadType: 'txt',
  fileNames: selectedFiles.map(f => f.name),
});

const files = new Map();
for (const file of selectedFiles) {
  files.set(file.name, await file.text());
}

await processUploadJob(job, files, token);
```

## 📖 Common Patterns

### Get Current Job Status
```tsx
const { currentJob } = useUploadJobs();

if (currentJob) {
  console.log(`${currentJob.statistics.completed}/${currentJob.statistics.total} uploaded`);
}
```

### Access Job History
```tsx
const { jobHistory } = useUploadJobs();

jobHistory.forEach(job => {
  console.log(`${job.jobId}: ${job.status}`);
});
```

### Listen to Events
```tsx
const { currentJob } = useUploadJobs({
  onJobCreated: (job) => console.log('Started:', job.jobId),
  onJobCompleted: (job) => console.log('Finished:', job.jobId),
  onJobFailed: (job) => console.log('Failed:', job.jobId),
});
```

### Cancel a Job
```tsx
const { cancelJob } = useUploadJobs();

// Pause upload
cancelJob(jobId);
```

### Access Individual File Status
```tsx
const { currentJob } = useUploadJobs();

currentJob?.files.forEach(file => {
  if (file.status === 'failed') {
    console.log(`${file.fileName}: ${file.error}`);
  }
});
```

### Notifications
```tsx
import { useAtom } from 'jotai';
import { uploadNotificationsAtom } from '@/atoms/uploadJobs';

const [notifications] = useAtom(uploadNotificationsAtom);

notifications.forEach(notif => {
  console.log(`[${notif.type}] ${notif.title}: ${notif.message}`);
});
```

## 🎨 UI Components

### Display Progress Bar
```tsx
{currentJob && (
  <Progress 
    value={(currentJob.statistics.completed / currentJob.statistics.total) * 100}
  />
)}
```

### Display File List with Status
```tsx
{currentJob?.files.map(file => (
  <div key={file.fileName}>
    <span>{file.fileName}</span>
    <span>{file.status}</span>
    <ProgressBar value={file.progress} />
    {file.error && <p>{file.error}</p>}
  </div>
))}
```

### Display Job History
```tsx
{jobHistory.map(job => (
  <div key={job.jobId}>
    <p>{job.collectionId}</p>
    <p>{job.status} - {job.statistics.completed}/{job.statistics.total}</p>
  </div>
))}
```

## 📊 Job Structure

```typescript
{
  jobId: "job_1234567890_abc",         // Unique identifier
  collectionId: "my-collection",       // Target collection
  uploadType: "json" | "txt",          // Upload type
  status: "pending" | "processing" | "completed",
  files: [
    {
      fileName: "document.txt",
      status: "completed" | "uploading" | "failed",
      progress: 100,                   // 0-100
      error?: "Error message",
      documentId?: "doc_id_123"
    }
  ],
  statistics: {
    total: 10,                         // Total files
    completed: 8,                      // Successful
    failed: 2,                         // Failed
    startedAt: 1234567890,
    completedAt?: 1234567900
  },
  createdAt: 1234567890,
  updatedAt: 1234567890
}
```

## 🔧 Configuration

### Job Configuration
```tsx
const job = createUploadJob({
  collectionId: 'collection-id',
  uploadType: 'json' | 'txt',
  fileNames: ['file1.json', 'file2.json'],
  configuration: {
    configurationId?: 'config-id',      // Optional for TXT
    toAnonymize: true,                  // For anonymization
    anonymizeTypes?: ['PERSON', 'ORG']  // Types to anonymize
  }
});
```

### Hook Options
```tsx
const {} = useUploadJobs({
  onJobCreated?: (job: UploadJob) => void,
  onJobCompleted?: (job: UploadJob) => void,
  onJobFailed?: (job: UploadJob) => void,
  onNotification?: (notification: any) => void,
});
```

## 🎯 Type Definitions

```tsx
import type {
  UploadJob,
  UploadJobFile,
  UploadJobStatus,
  CreateUploadJobInput,
} from '@/lib/upload/types';
```

## 📁 File Organization

```
frontend/
├── lib/upload/
│   ├── types.ts          ← Types and interfaces
│   ├── store.ts          ← Job persistence
│   └── README.md         ← Full documentation
├── atoms/uploadJobs.ts   ← Jotai state
├── hooks/upload/
│   └── useUploadJobs.ts  ← Main hook
└── components/
    ├── UploadNotificationCenter/  ← Notifications
    └── SimpleUploadExample.tsx    ← Example
```

## 🐛 Debugging

### Check Job in Console
```javascript
// In browser console
localStorage.getItem('upload_jobs');  // See all jobs
```

### Monitor Atoms
```tsx
import { useAtom } from 'jotai';
import { uploadJobsHistoryAtom, currentUploadJobAtom } from '@/atoms/uploadJobs';

const [jobs] = useAtom(uploadJobsHistoryAtom);
const [current] = useAtom(currentUploadJobAtom);

console.log('Jobs:', jobs);
console.log('Current:', current);
```

### Check Notifications
```tsx
import { useAtom } from 'jotai';
import { uploadNotificationsAtom } from '@/atoms/uploadJobs';

const [notifications] = useAtom(uploadNotificationsAtom);
console.log('Notifications:', notifications);
```

## ✅ Checklist

Before deploying:
- [ ] `UploadNotificationCenter` added to `_app.tsx`
- [ ] Tested with `SimpleUploadExample`
- [ ] Integrated with existing upload modal
- [ ] Verified notifications display
- [ ] Checked localStorage persistence
- [ ] Tested error handling
- [ ] Build passes without errors
- [ ] Backward compatibility verified

## 🔗 Links

- **Full Docs**: `frontend/lib/upload/README.md`
- **Integration Guide**: `frontend/UPLOAD_MIGRATION.md`
- **Working Example**: `frontend/components/SimpleUploadExample.tsx`
- **Summary**: `UPLOAD_SYSTEM_SUMMARY.md`

## 💡 Tips & Tricks

### Tip 1: Sequential Upload for Reliability
Files upload one at a time by default - great for server stability

### Tip 2: localStorage Recovery
Jobs persist in localStorage - users can refresh without losing progress

### Tip 3: Type-Safe Development
Full TypeScript support prevents runtime errors

### Tip 4: Flexible Callbacks
Use `onJobCompleted` to trigger any logic you need

### Tip 5: Custom Notifications
Extend `UploadNotificationCenter` for branded notifications

## 🚨 Common Issues

**Issue**: Notifications not showing  
**Solution**: Check `UploadNotificationCenter` is in root component

**Issue**: Jobs not persisting  
**Solution**: Check `localStorage.getItem('upload_jobs')` in console

**Issue**: Progress not updating  
**Solution**: Verify hook is calling `processUploadJob`

**Issue**: Type errors  
**Solution**: Ensure imports from `@/lib/upload/types`

## 📞 Support

- 📖 Read `frontend/lib/upload/README.md` for API docs
- 🔍 Check `frontend/UPLOAD_MIGRATION.md` for integration help
- 💻 Copy `SimpleUploadExample.tsx` for working example
- 🎯 See `UPLOAD_SYSTEM_SUMMARY.md` for overview

---

**That's it! You're ready to start using the file upload system.** 🎉
