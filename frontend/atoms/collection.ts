import { atom } from 'jotai';

export interface Collection {
  id: string;
  name: string;
  ownerId: string;
  allowedUserIds: string[];
  createdAt: string;
  updatedAt: string;
}

// Active collection atom
export const activeCollectionAtom = atom<Collection | null>(null);

// Collections list atom
export const collectionsAtom = atom<Collection[]>([]);
