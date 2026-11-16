import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
const firebaseConfig = {
  projectId: "symbolic-utility-rc62s",
  appId: "1:803550275474:web:90034cc024e95c9acbc34b",
  apiKey: "AIzaSyCvOMWzbWaVnWeIIYfBPu3AN4CIo911hbs",
  authDomain: "symbolic-utility-rc62s.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-sistemmanajemenp-a3b8769b-a916-4f9d-8fad-2aed61f136d0",
  storageBucket: "symbolic-utility-rc62s.firebasestorage.app",
  messagingSenderId: "803550275474",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

const CHUNK_SIZE = 550000; // ~550KB per chunk (safely under 1MB Firestore document limit)
export const MAX_CLOUD_FILE_BYTES = 4 * 1024 * 1024; // 4MB max

export function generateDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca berkas.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas dari perangkat.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadFileToFirestore(
  file: File,
  ownerUid: string
): Promise<{ fileId: string; fileName: string }> {
  if (file.size > MAX_CLOUD_FILE_BYTES) {
    throw new Error('Ukuran berkas melebihi batas maksimal 4MB.');
  }

  const dataUrl = await readFileAsDataUrl(file);
  const chunks: string[] = [];
  for (let i = 0; i < dataUrl.length; i += CHUNK_SIZE) {
    chunks.push(dataUrl.slice(i, i + CHUNK_SIZE));
  }
  if (chunks.length === 0) {
    chunks.push(dataUrl || 'data:application/octet-stream;base64,');
  }
  if (chunks.length > 10) {
    throw new Error('Ukuran berkas terenkode terlalu besar untuk disimpan.');
  }

  const fileId = generateDocId('file');
  const filePath = `files/${fileId}`;

  try {
    await setDoc(doc(db, 'files', fileId), {
      fileName: file.name.slice(0, 255),
      mimeType: (file.type || 'application/octet-stream').slice(0, 120),
      sizeBytes: file.size,
      chunkCount: chunks.length,
      isPublic: true,
      ownerUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, filePath);
  }

  try {
    await Promise.all(
      chunks.map((chunkData, index) =>
        setDoc(doc(db, 'files', fileId, 'chunks', `chunk_${index}`), {
          index,
          data: chunkData,
          isPublic: true,
          ownerUid,
        })
      )
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${filePath}/chunks`);
  }

  return { fileId, fileName: file.name };
}

export async function downloadFileFromFirestore(
  fileId: string
): Promise<{ fileName: string; dataUrl: string }> {
  const filePath = `files/${fileId}`;
  let fileName = 'berkas_perkuliahan';
  try {
    const metaSnap = await getDoc(doc(db, 'files', fileId));
    if (!metaSnap.exists()) {
      throw new Error('Berkas tidak ditemukan di server cloud.');
    }
    const metaData = metaSnap.data();
    fileName = typeof metaData.fileName === 'string' ? metaData.fileName : fileName;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, filePath);
  }

  const chunksPath = `files/${fileId}/chunks`;
  try {
    const chunkQuery = query(
      collection(db, 'files', fileId, 'chunks'),
      where('isPublic', '==', true)
    );
    const chunkSnap = await getDocs(chunkQuery);
    const ordered = chunkSnap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index);

    const dataUrl = ordered.map((c) => c.data).join('');
    if (!dataUrl) {
      throw new Error('Konten berkas kosong.');
    }
    return { fileName, dataUrl };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, chunksPath);
  }
}

export async function deleteFileFromFirestore(fileId?: string): Promise<void> {
  if (!fileId) return;
  try {
    const chunkQuery = query(
      collection(db, 'files', fileId, 'chunks'),
      where('isPublic', '==', true)
    );
    const chunkSnap = await getDocs(chunkQuery);
    await Promise.all(
      chunkSnap.docs.map((d) => deleteDoc(doc(db, 'files', fileId, 'chunks', d.id)))
    );
    await deleteDoc(doc(db, 'files', fileId));
  } catch {
    // Abaikan error hapus berkas lama jika tidak memiliki izin / sudah terhapus
  }
}
