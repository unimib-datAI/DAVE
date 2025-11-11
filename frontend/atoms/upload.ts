import { atom } from 'jotai';

export type UploadProgress = {
  total: number;
  completed: number;
  failed: number;
  isUploading: boolean;
  errors: Array<{ fileName: string; error: string }>;
};

export const uploadProgressAtom = atom<UploadProgress>({
  total: 0,
  completed: 0,
  failed: 0,
  isUploading: false,
  errors: [],
});

export const uploadModalOpenAtom = atom<boolean>(false);
