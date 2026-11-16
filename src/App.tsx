/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookMarked,
  BookOpen,
  Calendar,
  Check,
  CheckCircle,
  CheckSquare,
  ChevronRight,
  Clock,
  Cloud,
  Download,
  FileCheck,
  FileQuestion,
  Files,
  FileUp,
  FolderOpen,
  GraduationCap,
  Home,
  IdCard,
  LayoutDashboard,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Menu,
  Pencil,
  PenTool,
  Plus,
  PlusCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  deleteFileFromFirestore,
  downloadFileFromFirestore,
  generateDocId,
  googleProvider,
  handleFirestoreError,
  MAX_CLOUD_FILE_BYTES,
  OperationType,
  uploadFileToFirestore,
} from './firebase';

// ==========================================
// TYPES & SCHEMAS
// ==========================================
export interface MataKuliah {
  id_matkul: string;
  nama_matkul: string;
  dosen_pengampu: string;
  hari: string;
  jam: string;
  isPublic?: boolean;
  ownerUid?: string;
}

export interface Materi {
  id_materi: string;
  id_matkul: string;
  pertemuan: number;
  judul_materi: string;
  file_path: string;
  file_id?: string;
  isPublic?: boolean;
  ownerUid?: string;
}

export interface Tugas {
  id_tugas: string;
  id_matkul: string;
  nama_tugas: string;
  deskripsi: string;
  tenggat_waktu: string; // YYYY-MM-DD HH:mm:ss
  status: 'Belum Dimulai' | 'Proses' | 'Selesai';
  file_jawaban?: string;
  file_id?: string;
  catatan_jawaban?: string;
  submittedByUid?: string;
  submittedByName?: string;
  isPublic?: boolean;
  ownerUid?: string;
}

const getTomorrowDateStr = (hours = 23, minutes = 59) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(hours)}:${pad(minutes)}:00`;
};

const getFutureDateStr = (daysAhead: number, hours = 17, minutes = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(hours)}:${pad(minutes)}:00`;
};

export function getAutomatedTaskStatus(task: {
  status: string;
  tenggat_waktu: string;
  file_jawaban?: string;
}) {
  const hasFile = Boolean(task.file_jawaban && task.file_jawaban.trim());
  const normalizedDeadline = task.tenggat_waktu.includes(' ')
    ? task.tenggat_waktu.replace(' ', 'T')
    : task.tenggat_waktu;
  const deadlineDate = new Date(normalizedDeadline);
  const isOverdue = !hasFile && !isNaN(deadlineDate.getTime()) && new Date() > deadlineDate;

  if (hasFile) {
    return {
      label: 'Selesai' as const,
      isOverdue: false,
      hasFile: true,
      colorClass: 'text-emerald-700',
      badgeBg: 'bg-emerald-100 border-emerald-200',
      badgeText: 'text-emerald-800',
    };
  }

  if (isOverdue) {
    return {
      label: 'Terlambat' as const,
      isOverdue: true,
      hasFile: false,
      colorClass: 'text-rose-700',
      badgeBg: 'bg-rose-100 border-rose-300',
      badgeText: 'text-rose-800',
    };
  }

  if (task.status === 'Proses') {
    return {
      label: 'Proses' as const,
      isOverdue: false,
      hasFile: false,
      colorClass: 'text-amber-700',
      badgeBg: 'bg-amber-100 border-amber-200',
      badgeText: 'text-amber-800',
    };
  }

  return {
    label: 'Belum Dimulai' as const,
    isOverdue: false,
    hasFile: false,
    colorClass: 'text-slate-600',
    badgeBg: 'bg-slate-100 border-slate-200',
    badgeText: 'text-slate-700',
  };
}

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'matakuliah'>('dashboard');
  const [selectedMatkulId, setSelectedMatkulId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Firebase Auth State
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginNim, setLoginNim] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regNim, setRegNim] = useState('');
  const [regNama, setRegNama] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showProviderSetupHint, setShowProviderSetupHint] = useState(false);
  const [userProfile, setUserProfile] = useState<{ nama?: string; nim?: string } | null>(null);

  // Cloud Firestore Data State (shared across all users & browsers)
  const [matkulList, setMatkulList] = useState<MataKuliah[]>([]);
  const [materiList, setMateriList] = useState<Materi[]>([]);
  const [tugasList, setTugasList] = useState<Tugas[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  // Operation Loading States
  const [isSubmittingKerjakan, setIsSubmittingKerjakan] = useState(false);
  const [isSubmittingMateri, setIsSubmittingMateri] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  // Flash / Notification toast
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'info' | 'danger' } | null>(null);
  const showToast = (text: string, type: 'success' | 'info' | 'danger' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4500);
  };

  // Listen to Firebase Auth + fetch student profile from Firestore
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const saved = localStorage.getItem(`kuliah_profile_${user.uid}`);
          if (saved) setUserProfile(JSON.parse(saved));
        } catch {
          // ignore localStorage read error
        }
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            const data = snap.data();
            const profileData = {
              nama: data.nama ? String(data.nama) : user.displayName || undefined,
              nim: data.nim ? String(data.nim) : undefined,
            };
            setUserProfile(profileData);
            try {
              localStorage.setItem(`kuliah_profile_${user.uid}`, JSON.stringify(profileData));
            } catch {
              // ignore storage quota errors
            }
          }
        } catch {
          // ignore if user profile document does not exist yet
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Real-time Firestore Subscriptions (Only active after user logs in)
  useEffect(() => {
    if (!isAuthReady) return;
    if (!firebaseUser) {
      setMatkulList([]);
      setMateriList([]);
      setTugasList([]);
      setIsLoadingCloud(false);
      return;
    }

    setIsLoadingCloud(true);
    let loadedMatkul = false;
    let loadedMateri = false;
    let loadedTugas = false;
    const checkDone = () => {
      if (loadedMatkul && loadedMateri && loadedTugas) {
        setIsLoadingCloud(false);
      }
    };

    const qMatkul = query(collection(db, 'matakuliah'), where('isPublic', '==', true));
    const unsubMatkul = onSnapshot(
      qMatkul,
      (snapshot) => {
        const items: MataKuliah[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id_matkul: d.id,
            nama_matkul: String(data.nama_matkul || ''),
            dosen_pengampu: String(data.dosen_pengampu || ''),
            hari: String(data.hari || 'Senin'),
            jam: String(data.jam || ''),
            isPublic: Boolean(data.isPublic),
            ownerUid: String(data.ownerUid || ''),
          };
        });
        setMatkulList(items);
        loadedMatkul = true;
        checkDone();
      },
      (error) => {
        loadedMatkul = true;
        checkDone();
        handleFirestoreError(error, OperationType.LIST, 'matakuliah');
      }
    );

    const qMateri = query(collection(db, 'materi'), where('isPublic', '==', true));
    const unsubMateri = onSnapshot(
      qMateri,
      (snapshot) => {
        const items: Materi[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id_materi: d.id,
            id_matkul: String(data.id_matkul || ''),
            pertemuan: Number(data.pertemuan || 1),
            judul_materi: String(data.judul_materi || ''),
            file_path: String(data.file_path || ''),
            file_id: data.file_id ? String(data.file_id) : '',
            isPublic: Boolean(data.isPublic),
            ownerUid: String(data.ownerUid || ''),
          };
        });
        setMateriList(items);
        loadedMateri = true;
        checkDone();
      },
      (error) => {
        loadedMateri = true;
        checkDone();
        handleFirestoreError(error, OperationType.LIST, 'materi');
      }
    );

    const qTugas = query(collection(db, 'tugas'), where('isPublic', '==', true));
    const unsubTugas = onSnapshot(
      qTugas,
      (snapshot) => {
        const items: Tugas[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id_tugas: d.id,
            id_matkul: String(data.id_matkul || ''),
            nama_tugas: String(data.nama_tugas || ''),
            deskripsi: String(data.deskripsi || ''),
            tenggat_waktu: String(data.tenggat_waktu || ''),
            status: (data.status as Tugas['status']) || 'Belum Dimulai',
            file_jawaban: data.file_jawaban ? String(data.file_jawaban) : '',
            file_id: data.file_id ? String(data.file_id) : '',
            catatan_jawaban: data.catatan_jawaban ? String(data.catatan_jawaban) : '',
            submittedByUid: data.submittedByUid ? String(data.submittedByUid) : '',
            submittedByName: data.submittedByName ? String(data.submittedByName) : '',
            isPublic: Boolean(data.isPublic),
            ownerUid: String(data.ownerUid || ''),
          };
        });
        setTugasList(items);
        loadedTugas = true;
        checkDone();
      },
      (error) => {
        loadedTugas = true;
        checkDone();
        handleFirestoreError(error, OperationType.LIST, 'tugas');
      }
    );

    return () => {
      unsubMatkul();
      unsubMateri();
      unsubTugas();
    };
  }, [isAuthReady, firebaseUser]);

  // Modals state
  const [modalKerjakanOpen, setModalKerjakanOpen] = useState(false);
  const [modalRincianFileOpen, setModalRincianFileOpen] = useState(false);
  const [activeFileFilter, setActiveFileFilter] = useState<'all' | 'materi' | 'tugas'>('all');
  const [activeTaskForModal, setActiveTaskForModal] = useState<Tugas | null>(null);
  const [kerjakanStatus, setKerjakanStatus] = useState<'Belum Dimulai' | 'Proses' | 'Selesai'>('Proses');
  const [kerjakanCatatan, setKerjakanCatatan] = useState('');
  const [kerjakanFileName, setKerjakanFileName] = useState('');
  const [kerjakanSelectedFile, setKerjakanSelectedFile] = useState<File | null>(null);
  const [kerjakanExistingFileId, setKerjakanExistingFileId] = useState('');

  // Matkul Modals
  const [modalTambahMatkulOpen, setModalTambahMatkulOpen] = useState(false);
  const [newMatkul, setNewMatkul] = useState({ nama_matkul: '', dosen_pengampu: '', hari: 'Senin', jam: '08.00 - 10.30' });

  const [modalEditMatkulOpen, setModalEditMatkulOpen] = useState(false);
  const [editingMatkul, setEditingMatkul] = useState<MataKuliah | null>(null);

  const [modalHapusMatkulOpen, setModalHapusMatkulOpen] = useState(false);
  const [deletingMatkul, setDeletingMatkul] = useState<MataKuliah | null>(null);

  // Detail Class Modals
  const [modalUnggahMateriOpen, setModalUnggahMateriOpen] = useState(false);
  const [newMateri, setNewMateri] = useState<{
    pertemuan: number;
    judul_materi: string;
    fileName: string;
    fileObj: File | null;
  }>({ pertemuan: 1, judul_materi: '', fileName: '', fileObj: null });

  const [modalTambahTugasOpen, setModalTambahTugasOpen] = useState(false);
  const [newTugas, setNewTugas] = useState({
    nama_tugas: '',
    deskripsi: '',
    tenggat_waktu: '',
  });

  // Auth Helpers: Convert NIM -> synthetic internal Firebase Auth email
  const nimToAuthEmail = (nim: string) => {
    const cleaned = nim.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    return `${cleaned}@kuliahapp.id`;
  };

  // Handle NIM + Password Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setShowProviderSetupHint(false);

    const cleanedNim = loginNim.trim().replace(/[^a-zA-Z0-9._-]/g, '');
    if (cleanedNim.length < 3) {
      setAuthError('Masukkan NIM yang valid (minimal 3 karakter huruf/angka).');
      return;
    }
    if (loginPassword.length < 6) {
      setAuthError('Kata sandi minimal 6 karakter.');
      return;
    }

    setIsSigningIn(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, nimToAuthEmail(cleanedNim), loginPassword);
      setLoginPassword('');
      showToast(`Selamat datang kembali, ${cred.user.displayName || cleanedNim}!`, 'success');
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      const msg = error instanceof Error ? error.message : 'Gagal masuk ke akun.';
      if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
        setShowProviderSetupHint(true);
        setAuthError(
          'Login dengan NIM & Kata sandi memerlukan aktivasi metode "Email/Password" di Firebase Console terlebih dahulu.'
        );
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found' ||
        msg.includes('invalid-credential')
      ) {
        setAuthError('NIM atau kata sandi salah. Jika belum memiliki akun, silakan klik Daftar Sekarang.');
      } else if (code === 'auth/too-many-requests') {
        setAuthError('Terlalu banyak percobaan masuk. Silakan tunggu beberapa saat lalu coba lagi.');
      } else {
        setAuthError(`Gagal masuk: ${msg}`);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Handle NIM + Nama + Password Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setShowProviderSetupHint(false);

    const cleanedNim = regNim.trim().replace(/[^a-zA-Z0-9._-]/g, '');
    const cleanedNama = regNama.trim();
    if (cleanedNim.length < 3) {
      setAuthError('NIM mahasiswa minimal 3 karakter (hanya huruf/angka/tanda hubung).');
      return;
    }
    if (cleanedNama.length < 2) {
      setAuthError('Mohon masukkan Nama Lengkap Anda.');
      return;
    }
    if (regPassword.length < 6) {
      setAuthError('Kata sandi minimal harus terdiri dari 6 karakter.');
      return;
    }

    setIsSigningIn(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, nimToAuthEmail(cleanedNim), regPassword);
      await updateProfile(cred.user, { displayName: cleanedNama.slice(0, 120) });

      const profileData = {
        nim: regNim.trim().slice(0, 40),
        nama: cleanedNama.slice(0, 120),
      };
      try {
        await setDoc(doc(db, 'users', cred.user.uid), {
          nim: profileData.nim,
          nama: profileData.nama,
          role: 'mahasiswa',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.CREATE, `users/${cred.user.uid}`);
      }

      try {
        localStorage.setItem(`kuliah_profile_${cred.user.uid}`, JSON.stringify(profileData));
      } catch {
        // ignore storage quota errors
      }
      setUserProfile(profileData);
      setRegNim('');
      setRegNama('');
      setRegPassword('');
      setAuthMode('login');
      showToast(`Pendaftaran berhasil! Selamat datang, ${profileData.nama}.`, 'success');
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      const msg = error instanceof Error ? error.message : 'Gagal mendaftar.';
      if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
        setShowProviderSetupHint(true);
        setAuthError(
          'Pendaftaran NIM & Kata sandi memerlukan aktivasi metode "Email/Password" di Firebase Console terlebih dahulu.'
        );
      } else if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
        setAuthError('NIM ini sudah terdaftar. Silakan kembali ke halaman Login untuk masuk.');
      } else if (code === 'auth/weak-password') {
        setAuthError('Kata sandi terlalu lemah. Gunakan minimal 6 karakter.');
      } else {
        setAuthError(`Gagal mendaftar: ${msg}`);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Google Sign-In Fallback / Admin Login
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setShowProviderSetupHint(false);
    setIsSigningIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      showToast(`Berhasil masuk sebagai ${result.user.displayName || result.user.email}!`, 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Gagal masuk dengan Google.';
      if (msg.includes('unauthorized-domain')) {
        setAuthError(
          'Domain situs ini belum didaftarkan di Firebase Console (Authentication > Settings > Authorized domains).'
        );
      } else if (!msg.includes('popup-closed-by-user')) {
        setAuthError(`Gagal masuk dengan Google: ${msg}`);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      setSelectedMatkulId(null);
      setActiveTab('dashboard');
      setAuthMode('login');
      setAuthError(null);
      setShowProviderSetupHint(false);
      showToast('Anda telah keluar dari akun.', 'info');
    } catch {
      showToast('Gagal keluar dari akun.', 'danger');
    }
  };

  const requireSignedIn = (): FirebaseUser | null => {
    return firebaseUser;
  };

  // Seed Sample Data to Cloud Firestore
  const handleSeedSampleData = async () => {
    const user = requireSignedIn();
    if (!user) return;
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      const ownerUid = user.uid;

      const sampleMatkul = [
        { id: 'mk_seed_1', nama_matkul: 'Pemrograman Web Lanjut', dosen_pengampu: 'Dr. Hendra Gunawan, M.T.', hari: 'Senin', jam: '08.00 - 10.30' },
        { id: 'mk_seed_2', nama_matkul: 'Basis Data Relasional', dosen_pengampu: 'Siti Rahmawati, S.Kom., M.Cs.', hari: 'Selasa', jam: '13.00 - 15.30' },
        { id: 'mk_seed_3', nama_matkul: 'Kecerdasan Buatan & ML', dosen_pengampu: 'Prof. Bambang Supriyadi, Ph.D.', hari: 'Rabu', jam: '10.00 - 12.30' },
        { id: 'mk_seed_4', nama_matkul: 'Rekayasa Perangkat Lunak', dosen_pengampu: 'Ahmad Fauzi, M.Kom.', hari: 'Kamis', jam: '08.00 - 10.30' },
      ];

      for (const mk of sampleMatkul) {
        batch.set(doc(db, 'matakuliah', mk.id), {
          nama_matkul: mk.nama_matkul,
          dosen_pengampu: mk.dosen_pengampu,
          hari: mk.hari,
          jam: mk.jam,
          isPublic: true,
          ownerUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const sampleMateri = [
        { id: 'mat_seed_1', id_matkul: 'mk_seed_1', pertemuan: 1, judul_materi: 'Pengenalan Arsitektur MVC & Flask Framework', file_path: 'uploads/materi/pertemuan_1_mvc_flask.pdf' },
        { id: 'mat_seed_2', id_matkul: 'mk_seed_1', pertemuan: 2, judul_materi: 'Routing, Template Jinja2, dan Form Handling', file_path: 'uploads/materi/pertemuan_2_jinja_routing.pdf' },
        { id: 'mat_seed_3', id_matkul: 'mk_seed_2', pertemuan: 1, judul_materi: 'Normalisasi Basis Data 1NF sampai 3NF', file_path: 'uploads/materi/pertemuan_1_normalisasi_3nf.pdf' },
        { id: 'mat_seed_4', id_matkul: 'mk_seed_3', pertemuan: 1, judul_materi: 'Dasar Machine Learning dan Supervised Algorithms', file_path: 'uploads/materi/pertemuan_1_intro_ml.pdf' },
      ];

      for (const m of sampleMateri) {
        batch.set(doc(db, 'materi', m.id), {
          id_matkul: m.id_matkul,
          pertemuan: m.pertemuan,
          judul_materi: m.judul_materi,
          file_path: m.file_path,
          file_id: '',
          isPublic: true,
          ownerUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const sampleTugas = [
        {
          id: 'tug_seed_1',
          id_matkul: 'mk_seed_1',
          nama_tugas: 'Tugas 1: Implementasi CRUD Flask & MySQL',
          deskripsi: 'Buat antarmuka CRUD mahasiswa menggunakan Flask dan MySQL, lampirkan script SQL dan tangkapan layar endpoint.',
          tenggat_waktu: getTomorrowDateStr(23, 59),
          status: 'Proses',
        },
        {
          id: 'tug_seed_2',
          id_matkul: 'mk_seed_2',
          nama_tugas: 'Tugas Desain ERD & Normalisasi Toko Online',
          deskripsi: 'Rancang ERD sistem inventori dan lakukan normalisasi relasional minimal sampai bentuk 3NF.',
          tenggat_waktu: getFutureDateStr(3, 17, 0),
          status: 'Belum Dimulai',
        },
        {
          id: 'tug_seed_3',
          id_matkul: 'mk_seed_3',
          nama_tugas: 'Praktikum Linear Regression dengan Scikit-Learn',
          deskripsi: 'Eksplorasi dataset perumahan dan hitung metrik Mean Squared Error serta nilai R2 score.',
          tenggat_waktu: getFutureDateStr(5, 23, 59),
          status: 'Belum Dimulai',
        },
        {
          id: 'tug_seed_4',
          id_matkul: 'mk_seed_4',
          nama_tugas: 'Dokumen Spesifikasi Kebutuhan Perangkat Lunak (SRS)',
          deskripsi: 'Penyusunan dokumen SRS berstandar IEEE untuk sistem akademik.',
          tenggat_waktu: getFutureDateStr(-2, 23, 59),
          status: 'Selesai',
          file_jawaban: 'uploads/tugas/srs_sistem_akademik_azlan.pdf',
          catatan_jawaban: 'Dokumen final SRS telah lengkap dengan diagram use case.',
        },
        {
          id: 'tug_seed_5',
          id_matkul: 'mk_seed_2',
          nama_tugas: 'Tugas Analisis Query & Relasi SQL Lanjutan',
          deskripsi: 'Optimasi query JOIN dan pembuatan index pada tabel berskala besar.',
          tenggat_waktu: getFutureDateStr(-1, 23, 59),
          status: 'Belum Dimulai',
        },
      ];

      for (const t of sampleTugas) {
        batch.set(doc(db, 'tugas', t.id), {
          id_matkul: t.id_matkul,
          nama_tugas: t.nama_tugas,
          deskripsi: t.deskripsi,
          tenggat_waktu: t.tenggat_waktu,
          status: t.status,
          file_jawaban: t.file_jawaban || '',
          file_id: '',
          catatan_jawaban: t.catatan_jawaban || '',
          submittedByUid: '',
          submittedByName: '',
          isPublic: true,
          ownerUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      showToast('Data contoh berhasil dimuat ke database cloud!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'batch_seed');
    } finally {
      setIsSeeding(false);
    }
  };

  // H-1 Banner Detection Logic
  const tugasH1List = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    return tugasList.filter((t) => {
      const auto = getAutomatedTaskStatus(t);
      if (auto.label === 'Selesai') return false;
      const deadlineDateStr = t.tenggat_waktu.split(' ')[0] || t.tenggat_waktu.split('T')[0];
      return deadlineDateStr === tomorrowStr;
    });
  }, [tugasList]);

  // Metrics Calculation
  const metrics = useMemo(() => {
    const fileMateriCount = materiList.filter((m) => Boolean(m.file_path)).length;
    const fileTugasCount = tugasList.filter((t) => Boolean(t.file_jawaban)).length;
    const activeTasksCount = tugasList.filter((t) => !t.file_jawaban).length;
    const overdueCount = tugasList.filter((t) => getAutomatedTaskStatus(t).label === 'Terlambat').length;
    return {
      totalFile: fileMateriCount + fileTugasCount,
      fileMateriCount,
      fileTugasCount,
      tugasAktif: activeTasksCount,
      overdueCount,
      totalMateri: materiList.length,
    };
  }, [materiList, tugasList]);

  // Search state variables
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchFocused, setGlobalSearchFocused] = useState(false);
  const [detailSearchQuery, setDetailSearchQuery] = useState('');

  // Active Tasks for Dashboard Table
  const tugasAktifTable = useMemo(() => {
    return tugasList
      .filter((t) => !t.file_jawaban)
      .map((t) => {
        const matkul = matkulList.find((m) => m.id_matkul === t.id_matkul);
        const autoStatus = getAutomatedTaskStatus(t);
        return {
          ...t,
          nama_matkul: matkul?.nama_matkul || 'Mata Kuliah',
          dosen_pengampu: matkul?.dosen_pengampu || '-',
          autoStatus,
        };
      })
      .sort((a, b) => new Date(a.tenggat_waktu).getTime() - new Date(b.tenggat_waktu).getTime());
  }, [tugasList, matkulList]);

  // Global search across Materi, Tugas, and MataKuliah
  const globalSearchResults = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (!q) return { materi: [], tugas: [], matkul: [], totalCount: 0 };

    const matchingMatkul = matkulList.filter(
      (m) => m.nama_matkul.toLowerCase().includes(q) || m.dosen_pengampu.toLowerCase().includes(q)
    );

    const matchingMateri = materiList
      .filter((m) => {
        const matkul = matkulList.find((mk) => mk.id_matkul === m.id_matkul);
        return (
          m.judul_materi.toLowerCase().includes(q) ||
          `pertemuan ${m.pertemuan}`.toLowerCase().includes(q) ||
          (matkul && matkul.nama_matkul.toLowerCase().includes(q))
        );
      })
      .map((m) => ({
        ...m,
        matkulNama: matkulList.find((mk) => mk.id_matkul === m.id_matkul)?.nama_matkul || 'Mata Kuliah',
      }));

    const matchingTugas = tugasList
      .filter((t) => {
        const matkul = matkulList.find((mk) => mk.id_matkul === t.id_matkul);
        return (
          t.nama_tugas.toLowerCase().includes(q) ||
          t.deskripsi.toLowerCase().includes(q) ||
          t.status.toLowerCase().includes(q) ||
          (matkul && matkul.nama_matkul.toLowerCase().includes(q))
        );
      })
      .map((t) => ({
        ...t,
        matkulNama: matkulList.find((mk) => mk.id_matkul === t.id_matkul)?.nama_matkul || 'Mata Kuliah',
      }));

    return {
      materi: matchingMateri,
      tugas: matchingTugas,
      matkul: matchingMatkul,
      totalCount: matchingMateri.length + matchingTugas.length + matchingMatkul.length,
    };
  }, [globalSearchQuery, matkulList, materiList, tugasList]);

  // Derived state & memoized filtered lists for Selected Mata Kuliah
  const selectedMatkul = matkulList.find((m) => m.id_matkul === selectedMatkulId);
  const selectedMateriList = useMemo(
    () => materiList.filter((m) => m.id_matkul === selectedMatkulId).sort((a, b) => a.pertemuan - b.pertemuan),
    [materiList, selectedMatkulId]
  );
  const selectedTugasList = useMemo(
    () =>
      tugasList
        .filter((t) => t.id_matkul === selectedMatkulId)
        .sort((a, b) => new Date(a.tenggat_waktu).getTime() - new Date(b.tenggat_waktu).getTime()),
    [tugasList, selectedMatkulId]
  );

  const filteredSelectedMateri = useMemo(() => {
    const q = detailSearchQuery.trim().toLowerCase();
    if (!q) return selectedMateriList;
    return selectedMateriList.filter(
      (m) => m.judul_materi.toLowerCase().includes(q) || `pertemuan ${m.pertemuan}`.toLowerCase().includes(q)
    );
  }, [selectedMateriList, detailSearchQuery]);

  const filteredSelectedTugas = useMemo(() => {
    const q = detailSearchQuery.trim().toLowerCase();
    if (!q) return selectedTugasList;
    return selectedTugasList.filter(
      (t) =>
        t.nama_tugas.toLowerCase().includes(q) ||
        t.deskripsi.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
    );
  }, [selectedTugasList, detailSearchQuery]);

  // Helper: valid PDF generator for seeded demo items without uploaded binary
  const createSamplePdfBlob = (lines: string[]) => {
    const sanitize = (str: string) =>
      str.replace(/[^\x20-\x7E]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

    const textOps = lines
      .map((line, idx) => {
        const y = 760 - idx * 20;
        const size = idx === 0 ? 14 : 10;
        return `BT /F1 ${size} Tf 50 ${y} Td (${sanitize(line)}) Tj ET`;
      })
      .join('\n');

    const stream = `${textOps}\n`;
    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
      `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    ];

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (const obj of objects) {
      offsets.push(pdf.length);
      pdf += obj;
    }
    const xrefPos = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i < offsets.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    return new Blob([pdf], { type: 'application/pdf' });
  };

  // Real File Download Handler (Downloads cloud file from Firestore or fallback sample PDF)
  const handleDownloadFile = async (
    key: string,
    filePath: string,
    fileId?: string,
    meta?: { title?: string; subtitle?: string; description?: string }
  ) => {
    const cleanFileName = filePath.split('/').pop() || 'berkas_perkuliahan.pdf';

    if (fileId) {
      setDownloadingKey(key);
      try {
        const { fileName, dataUrl } = await downloadFileFromFirestore(fileId);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName || cleanFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`Berhasil mengunduh berkas: ${fileName || cleanFileName}`, 'success');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Gagal mengunduh berkas dari cloud.';
        showToast(msg, 'danger');
      } finally {
        setDownloadingKey(null);
      }
      return;
    }

    const isPdf = cleanFileName.toLowerCase().endsWith('.pdf');
    const summaryLines = [
      meta?.title || 'Dokumen Sistem Manajemen Perkuliahan',
      meta?.subtitle || `Nama Berkas: ${cleanFileName}`,
      '--------------------------------------------------',
      meta?.description || 'Dokumen contoh bawaan sistem.',
    ];

    const blob = isPdf
      ? createSamplePdfBlob(summaryLines)
      : new Blob([summaryLines.join('\n')], { type: 'text/plain;charset=utf-8' });

    const downloadName = isPdf
      ? cleanFileName
      : `${cleanFileName.replace(/\.[^/.]+$/, '')}_ringkasan.txt`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Mengunduh berkas contoh: ${downloadName}`, 'success');
  };

  // Handlers for Kerjakan modal
  const handleOpenKerjakan = (task: Tugas) => {
    setActiveTaskForModal(task);
    setKerjakanStatus(task.status);
    setKerjakanCatatan(task.catatan_jawaban || '');
    setKerjakanFileName(task.file_jawaban ? task.file_jawaban.split('/').pop() || '' : '');
    setKerjakanSelectedFile(null);
    setKerjakanExistingFileId(task.file_id || '');
    setModalKerjakanOpen(true);
  };

  const handleSaveKerjakan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTaskForModal) return;
    const user = requireSignedIn();
    if (!user) return;

    setIsSubmittingKerjakan(true);
    try {
      let finalFileId = kerjakanExistingFileId;
      let finalFilePath = kerjakanFileName.trim()
        ? kerjakanFileName.startsWith('uploads/')
          ? kerjakanFileName.slice(0, 255)
          : `uploads/tugas/${kerjakanFileName}`.slice(0, 255)
        : '';

      if (kerjakanSelectedFile) {
        const uploaded = await uploadFileToFirestore(kerjakanSelectedFile, user.uid);
        if (kerjakanExistingFileId) {
          await deleteFileFromFirestore(kerjakanExistingFileId);
        }
        finalFileId = uploaded.fileId;
        finalFilePath = `uploads/tugas/${uploaded.fileName}`.slice(0, 255);
      } else if (!kerjakanFileName.trim() && kerjakanExistingFileId) {
        await deleteFileFromFirestore(kerjakanExistingFileId);
        finalFileId = '';
        finalFilePath = '';
      }

      const hasUploadedFile = Boolean(finalFilePath);
      const resolvedStatus: 'Belum Dimulai' | 'Proses' | 'Selesai' = hasUploadedFile
        ? 'Selesai'
        : kerjakanStatus === 'Selesai'
        ? 'Proses'
        : kerjakanStatus;

      const taskPath = `tugas/${activeTaskForModal.id_tugas}`;
      try {
        await updateDoc(doc(db, 'tugas', activeTaskForModal.id_tugas), {
          status: resolvedStatus,
          file_jawaban: finalFilePath,
          file_id: finalFileId,
          catatan_jawaban: kerjakanCatatan.slice(0, 2000),
          submittedByUid: user.uid,
          submittedByName: (user.displayName || user.email || 'Mahasiswa').slice(0, 120),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, taskPath);
      }

      setModalKerjakanOpen(false);
      if (hasUploadedFile) {
        showToast(
          `Berkas jawaban diunggah ke cloud! Tugas "${activeTaskForModal.nama_tugas}" otomatis Selesai & bisa diunduh siapa saja.`,
          'success'
        );
      } else {
        showToast(`Progres tugas disimpan. Berkas belum diunggah sehingga tugas belum Selesai.`, 'info');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Gagal menyimpan jawaban tugas.';
      showToast(msg, 'danger');
    } finally {
      setIsSubmittingKerjakan(false);
    }
  };

  // Handlers for Matkul CRUD
  const handleTambahMatkul = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatkul.nama_matkul || !newMatkul.dosen_pengampu) return;
    const user = requireSignedIn();
    if (!user) return;

    const newId = generateDocId('mk');
    const path = `matakuliah/${newId}`;
    try {
      await setDoc(doc(db, 'matakuliah', newId), {
        nama_matkul: newMatkul.nama_matkul.trim().slice(0, 150),
        dosen_pengampu: newMatkul.dosen_pengampu.trim().slice(0, 120),
        hari: newMatkul.hari,
        jam: newMatkul.jam.trim().slice(0, 40),
        isPublic: true,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewMatkul({ nama_matkul: '', dosen_pengampu: '', hari: 'Senin', jam: '08.00 - 10.30' });
      setModalTambahMatkulOpen(false);
      showToast('Mata kuliah baru berhasil disimpan ke database cloud!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleSaveEditMatkul = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMatkul) return;
    const user = requireSignedIn();
    if (!user) return;

    const path = `matakuliah/${editingMatkul.id_matkul}`;
    try {
      await updateDoc(doc(db, 'matakuliah', editingMatkul.id_matkul), {
        nama_matkul: editingMatkul.nama_matkul.trim().slice(0, 150),
        dosen_pengampu: editingMatkul.dosen_pengampu.trim().slice(0, 120),
        hari: editingMatkul.hari,
        jam: editingMatkul.jam.trim().slice(0, 40),
        isPublic: true,
        updatedAt: serverTimestamp(),
      });
      setModalEditMatkulOpen(false);
      showToast('Data mata kuliah berhasil diperbarui!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleConfirmHapusMatkul = async () => {
    if (!deletingMatkul) return;
    const user = requireSignedIn();
    if (!user) return;

    const targetId = deletingMatkul.id_matkul;
    const targetName = deletingMatkul.nama_matkul;
    const relatedMateri = materiList.filter((m) => m.id_matkul === targetId);
    const relatedTugas = tugasList.filter((t) => t.id_matkul === targetId);

    try {
      await Promise.all([
        ...relatedMateri.map(async (m) => {
          await deleteFileFromFirestore(m.file_id);
          await deleteDoc(doc(db, 'materi', m.id_materi));
        }),
        ...relatedTugas.map(async (t) => {
          await deleteFileFromFirestore(t.file_id);
          await deleteDoc(doc(db, 'tugas', t.id_tugas));
        }),
      ]);
      await deleteDoc(doc(db, 'matakuliah', targetId));

      if (selectedMatkulId === targetId) {
        setSelectedMatkulId(null);
      }
      setModalHapusMatkulOpen(false);
      showToast(`Mata kuliah "${targetName}" beserta materi & tugas berhasil dihapus.`, 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `matakuliah/${targetId}`);
    }
  };

  // Detail view handlers
  const handleTambahMateri = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatkulId || !newMateri.judul_materi) return;
    const user = requireSignedIn();
    if (!user) return;

    setIsSubmittingMateri(true);
    try {
      let fileId = '';
      const savedFileName =
        newMateri.fileName ||
        `pertemuan_${newMateri.pertemuan}_${newMateri.judul_materi.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`;

      if (newMateri.fileObj) {
        const uploaded = await uploadFileToFirestore(newMateri.fileObj, user.uid);
        fileId = uploaded.fileId;
      }

      const newId = generateDocId('mat');
      try {
        await setDoc(doc(db, 'materi', newId), {
          id_matkul: selectedMatkulId,
          pertemuan: Math.min(32, Math.max(1, Number(newMateri.pertemuan) || 1)),
          judul_materi: newMateri.judul_materi.trim().slice(0, 200),
          file_path: `uploads/materi/${savedFileName}`.slice(0, 255),
          file_id: fileId,
          isPublic: true,
          ownerUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `materi/${newId}`);
      }

      setNewMateri({ pertemuan: 1, judul_materi: '', fileName: '', fileObj: null });
      setModalUnggahMateriOpen(false);
      showToast('Materi perkuliahan berhasil diunggah ke cloud!', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Gagal mengunggah materi.';
      showToast(msg, 'danger');
    } finally {
      setIsSubmittingMateri(false);
    }
  };

  const handleHapusMateri = async (materi: Materi) => {
    const user = requireSignedIn();
    if (!user) return;
    if (!confirm('Hapus materi perkuliahan ini?')) return;

    try {
      await deleteFileFromFirestore(materi.file_id);
      await deleteDoc(doc(db, 'materi', materi.id_materi));
      showToast('Materi berhasil dihapus.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `materi/${materi.id_materi}`);
    }
  };

  const handleTambahTugas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatkulId || !newTugas.nama_tugas) return;
    const user = requireSignedIn();
    if (!user) return;

    const newId = generateDocId('tug');
    const deadline = newTugas.tenggat_waktu.replace('T', ' ') || getFutureDateStr(2, 23, 59);
    const formattedDeadline = (deadline.length === 16 ? `${deadline}:00` : deadline).slice(0, 40);

    try {
      await setDoc(doc(db, 'tugas', newId), {
        id_matkul: selectedMatkulId,
        nama_tugas: newTugas.nama_tugas.trim().slice(0, 200),
        deskripsi: newTugas.deskripsi.trim().slice(0, 2000),
        tenggat_waktu: formattedDeadline,
        status: 'Belum Dimulai',
        file_jawaban: '',
        file_id: '',
        catatan_jawaban: '',
        submittedByUid: '',
        submittedByName: '',
        isPublic: true,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewTugas({ nama_tugas: '', deskripsi: '', tenggat_waktu: '' });
      setModalTambahTugasOpen(false);
      showToast('Tugas baru berhasil disimpan! Status otomatis: Belum Dikerjakan.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tugas/${newId}`);
    }
  };

  const handleHapusTugas = async (tugas: Tugas) => {
    const user = requireSignedIn();
    if (!user) return;
    if (!confirm('Hapus tugas ini?')) return;

    try {
      await deleteFileFromFirestore(tugas.file_id);
      await deleteDoc(doc(db, 'tugas', tugas.id_tugas));
      showToast('Tugas berhasil dihapus.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tugas/${tugas.id_tugas}`);
    }
  };

  // Display user info in header
  const displayName = userProfile?.nama || firebaseUser?.displayName || firebaseUser?.email || 'Mahasiswa';
  const displaySub = userProfile?.nim
    ? userProfile.nim
    : firebaseUser?.email?.endsWith('@kuliahapp.id')
    ? firebaseUser.email.replace('@kuliahapp.id', '')
    : firebaseUser?.email || 'Terhubung ke Cloud';
  const displayInitial = displayName.trim().substring(0, 2).toUpperCase() || 'MH';

  // ==========================================
  // GATE 1: CHECKING AUTH SESSION
  // ==========================================
  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] px-4">
        <div className="w-14 h-14 rounded-2xl bg-[#2563EB] text-white flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4">
          <GraduationCap className="w-7 h-7" />
        </div>
        <Loader2 className="w-6 h-6 text-[#2563EB] animate-spin mb-2" />
        <p className="text-xs font-medium text-slate-500">Memeriksa sesi masuk...</p>
      </div>
    );
  }

  // ==========================================
  // GATE 2: PORTAL PERKULIAHAN — LOGIN & REGISTRASI AKUN
  // ==========================================
  if (!firebaseUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] text-slate-700 px-4 py-10">
        {/* Centered Portal Brand Header */}
        <div className="text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-[#2563EB] text-white flex items-center justify-center shadow-lg shadow-blue-600/25 mx-auto mb-4">
            <GraduationCap className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Portal Perkuliahan</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Sistem Manajemen Tugas &amp; Materi Mahasiswa
          </p>
        </div>

        {/* Auth Card */}
        <div className="w-full max-w-[430px]">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8">
            {authMode === 'login' ? (
              <div>
                <h2 className="text-lg font-bold text-[#0F172A] pb-4 mb-5 border-b border-slate-100">
                  Masuk Akun
                </h2>

                {authError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{authError}</span>
                    </div>
                    {showProviderSetupHint && (
                      <div className="pt-2 border-t border-rose-200/80 flex flex-col gap-2">
                        <p className="text-[11px] text-rose-800">
                          Buka <strong>Firebase Console &gt; Authentication &gt; Sign-in method</strong> lalu aktifkan{' '}
                          <strong>Email/Password</strong>, atau masuk menggunakan Google di bawah:
                        </p>
                        <button
                          type="button"
                          onClick={handleGoogleSignIn}
                          disabled={isSigningIn}
                          className="w-full py-2 px-3 bg-white border border-rose-300 hover:bg-rose-100/60 text-rose-800 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          <span>Masuk dengan Google</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Nomor Induk Mahasiswa (NIM)
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={loginNim}
                        onChange={(e) => setLoginNim(e.target.value)}
                        placeholder="240511200"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#2563EB] transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Kata sandi
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        type="password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#2563EB] transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSigningIn}
                    className="w-full mt-2 py-3 px-4 bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs flex items-center justify-center gap-2 transition disabled:opacity-60"
                  >
                    {isSigningIn ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Masuk ke Dashboard</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                  <p className="text-xs text-slate-500">
                    Belum memiliki akun terdaftar?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setAuthError(null);
                        setShowProviderSetupHint(false);
                      }}
                      className="text-[#2563EB] font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      <span>Daftar Sekarang</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-bold text-[#0F172A] pb-4 mb-5 border-b border-slate-100">
                  Registrasi Akun
                </h2>

                {authError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{authError}</span>
                    </div>
                    {showProviderSetupHint && (
                      <div className="pt-2 border-t border-rose-200/80 flex flex-col gap-2">
                        <p className="text-[11px] text-rose-800">
                          Buka <strong>Firebase Console &gt; Authentication &gt; Sign-in method</strong> lalu aktifkan{' '}
                          <strong>Email/Password</strong>, atau masuk menggunakan Google di bawah:
                        </p>
                        <button
                          type="button"
                          onClick={handleGoogleSignIn}
                          disabled={isSigningIn}
                          className="w-full py-2 px-3 bg-white border border-rose-300 hover:bg-rose-100/60 text-rose-800 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          <span>Masuk dengan Google</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      NIM Mahasiswa
                    </label>
                    <div className="relative">
                      <IdCard className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={regNim}
                        onChange={(e) => setRegNim(e.target.value)}
                        placeholder="Contoh: 240511200"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#2563EB] transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Nama Lengkap
                    </label>
                    <div className="relative">
                      <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={regNama}
                        onChange={(e) => setRegNama(e.target.value)}
                        placeholder="Muhammad Azlan Farizki"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#2563EB] transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Kata sandi
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-[#2563EB] transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSigningIn}
                    className="w-full mt-2 py-3 px-4 bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs flex items-center justify-center gap-2 transition disabled:opacity-60"
                  >
                    {isSigningIn ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Daftar Akun Mahasiswa</span>
                        <Check className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>

          {authMode === 'register' && (
            <div className="mt-5 text-center">
              <p className="text-xs text-slate-500">
                Sudah punya akun?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                    setShowProviderSetupHint(false);
                  }}
                  className="text-[#2563EB] font-semibold hover:underline inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Kembali ke Login</span>
                </button>
              </p>
            </div>
          )}

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="text-[11px] font-medium text-slate-400 hover:text-[#2563EB] transition"
            >
              Atau masuk menggunakan akun Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: MAIN APPLICATION
  // ==========================================
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#64748B]">
      {/* TOP NAVIGATION BAR */}
      <header className="bg-[#2563EB] text-white border-b border-blue-700 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between text-white">
          {/* Logo & App Name */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                setActiveTab('dashboard');
                setSelectedMatkulId(null);
              }}
              className="flex items-center space-x-3 text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-white text-[#2563EB] flex items-center justify-center font-bold text-lg shadow-sm group-hover:scale-105 transition-transform">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <span className="text-base font-bold text-white tracking-tight group-hover:text-blue-100 transition-colors">
                  KuliahApp
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
            <button
              onClick={() => {
                setActiveTab('dashboard');
                setSelectedMatkulId(null);
              }}
              className={`pb-1 transition-colors ${
                activeTab === 'dashboard' && selectedMatkulId === null
                  ? 'text-white font-bold border-b-2 border-white'
                  : 'text-blue-100 hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => {
                setActiveTab('matakuliah');
              }}
              className={`pb-1 transition-colors ${
                activeTab === 'matakuliah'
                  ? 'text-white font-bold border-b-2 border-white'
                  : 'text-blue-100 hover:text-white'
              }`}
            >
              Mata Kuliah
            </button>
          </nav>

          {/* Global Quick Search Bar */}
          <div className="relative flex-1 max-w-sm mx-4 hidden md:block">
            <div className="relative">
              <Search className="w-4 h-4 text-blue-200 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={globalSearchQuery}
                onChange={(e) => {
                  setGlobalSearchQuery(e.target.value);
                  setGlobalSearchFocused(true);
                }}
                onFocus={() => setGlobalSearchFocused(true)}
                placeholder="Cari materi atau tugas (tanpa scroll)..."
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-blue-700/60 border border-blue-400/40 text-white placeholder:text-blue-200 focus:bg-white focus:text-slate-900 focus:placeholder:text-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 transition"
              />
              {globalSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setGlobalSearchQuery('');
                    setGlobalSearchFocused(false);
                  }}
                  className="absolute right-2.5 top-2 text-blue-200 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown Live Results */}
            {globalSearchFocused && globalSearchQuery.trim().length > 0 && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setGlobalSearchFocused(false)} />
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden max-h-96 flex flex-col text-slate-800 animate-in fade-in zoom-in-95 duration-100">
                  <div className="p-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Hasil Pencarian: <strong>{globalSearchResults.totalCount}</strong> ditemukan
                    </span>
                    <button
                      onClick={() => setGlobalSearchFocused(false)}
                      className="text-slate-400 hover:text-slate-600 font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="p-2 overflow-y-auto space-y-3 max-h-80 text-xs">
                    {globalSearchResults.tugas.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 flex items-center gap-1">
                          <CheckSquare className="w-3 h-3 text-blue-600" />
                          <span>Tugas ({globalSearchResults.tugas.length})</span>
                        </div>
                        <div className="space-y-1 mt-1">
                          {globalSearchResults.tugas.map((t) => (
                            <button
                              key={`search-t-${t.id_tugas}`}
                              onClick={() => {
                                handleOpenKerjakan(t);
                                setGlobalSearchFocused(false);
                                setGlobalSearchQuery('');
                              }}
                              className="w-full text-left p-2 rounded-lg hover:bg-blue-50/80 transition flex items-center justify-between group"
                            >
                              <div className="truncate pr-2">
                                <div className="font-semibold text-slate-800 group-hover:text-blue-600 truncate">
                                  {t.nama_tugas}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {t.matkulNama} &middot; Tenggat: {t.tenggat_waktu}
                                </div>
                              </div>
                              <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                                Kerjakan &rarr;
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {globalSearchResults.materi.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 flex items-center gap-1">
                          <BookOpen className="w-3 h-3 text-emerald-600" />
                          <span>Materi Kuliah ({globalSearchResults.materi.length})</span>
                        </div>
                        <div className="space-y-1 mt-1">
                          {globalSearchResults.materi.map((m) => (
                            <button
                              key={`search-m-${m.id_materi}`}
                              onClick={() => {
                                setSelectedMatkulId(m.id_matkul);
                                setActiveTab('matakuliah');
                                setGlobalSearchFocused(false);
                                setGlobalSearchQuery('');
                                showToast(`Membuka materi: ${m.judul_materi}`, 'info');
                              }}
                              className="w-full text-left p-2 rounded-lg hover:bg-emerald-50/80 transition flex items-center justify-between group"
                            >
                              <div className="truncate pr-2">
                                <div className="font-semibold text-slate-800 group-hover:text-emerald-700 truncate">
                                  {m.judul_materi}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {m.matkulNama} &middot; Pertemuan {m.pertemuan}
                                </div>
                              </div>
                              <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                Buka Modul &rarr;
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {globalSearchResults.matkul.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 flex items-center gap-1">
                          <GraduationCap className="w-3 h-3 text-purple-600" />
                          <span>Mata Kuliah ({globalSearchResults.matkul.length})</span>
                        </div>
                        <div className="space-y-1 mt-1">
                          {globalSearchResults.matkul.map((mk) => (
                            <button
                              key={`search-mk-${mk.id_matkul}`}
                              onClick={() => {
                                setSelectedMatkulId(mk.id_matkul);
                                setActiveTab('matakuliah');
                                setGlobalSearchFocused(false);
                                setGlobalSearchQuery('');
                              }}
                              className="w-full text-left p-2 rounded-lg hover:bg-purple-50/80 transition flex items-center justify-between group"
                            >
                              <div className="truncate pr-2">
                                <div className="font-semibold text-slate-800 group-hover:text-purple-700 truncate">
                                  {mk.nama_matkul}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {mk.dosen_pengampu} &middot; {mk.hari}, {mk.jam}
                                </div>
                              </div>
                              <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                                Masuk Kelas &rarr;
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {globalSearchResults.totalCount === 0 && (
                      <div className="py-6 text-center text-slate-400 text-xs">
                        Tidak ada materi, tugas, atau kelas yang cocok dengan "{globalSearchQuery}".
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Profil & Google Auth di Sudut Kanan Atas */}
          <div className="flex items-center space-x-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-white leading-tight">{displayName}</div>
              <div className="text-[11px] text-blue-200 truncate max-w-[180px]">{displaySub}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-white text-[#2563EB] font-bold text-xs uppercase shadow-xs flex items-center justify-center">
              {displayInitial}
            </div>
            <button
              onClick={handleSignOut}
              title="Keluar Akun"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-100 hover:text-white hover:bg-blue-700/60 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden lg:inline">Keluar</span>
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-white hover:bg-blue-700/60 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-blue-700 px-4 py-3 bg-blue-800 text-white flex flex-col space-y-2 text-sm font-medium">
            <button
              onClick={() => {
                setActiveTab('dashboard');
                setSelectedMatkulId(null);
                setMobileMenuOpen(false);
              }}
              className="text-left py-1 text-blue-100 hover:text-white flex items-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard Utama</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('matakuliah');
                setSelectedMatkulId(null);
                setMobileMenuOpen(false);
              }}
              className="text-left py-1 text-blue-100 hover:text-white flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              <span>Manajemen Mata Kuliah</span>
            </button>
          </div>
        )}
      </header>

      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm">
          <div
            className={`p-3.5 rounded-xl text-xs font-semibold shadow-lg border flex items-center justify-between gap-3 ${
              toastMsg.type === 'danger'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : toastMsg.type === 'info'
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <span>{toastMsg.text}</span>
            <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-slate-700">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MAIN CONTAINER */}
      {/* ======================================================== */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoadingCloud ? (
          <div className="py-20 text-center">
            <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">Menghubungkan ke database cloud...</p>
          </div>
        ) : (
          <>
            {/* Empty Cloud Prompt Banner (Only when Firestore is completely empty) */}
            {matkulList.length === 0 && (
              <div className="mb-6 bg-white border border-blue-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#1E293B]">Database Cloud Siap Digunakan</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Belum ada mata kuliah tersimpan di cloud. Anda dapat memuat data contoh atau menambah mata kuliah baru agar tampil seragam untuk semua pengunjung & dosen.
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleSeedSampleData}
                    disabled={isSeeding}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-lg transition disabled:opacity-60"
                  >
                    {isSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                    <span>Muat Data Contoh</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!requireSignedIn()) return;
                      setActiveTab('matakuliah');
                      setModalTambahMatkulOpen(true);
                    }}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Tambah Mata Kuliah</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 1: DASHBOARD UTAMA */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* 1. BANNER NOTIFIKASI H-1 */}
                {tugasH1List.length > 0 && (
                  <div className="rounded-xl border border-[#FDA4AF] bg-[#FFE4E6] p-4 text-[#9F1239] shadow-xs">
                    <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-3">
                      <div className="flex items-start sm:items-center space-x-3">
                        <div className="w-9 h-9 rounded-lg bg-rose-200/80 flex items-center justify-center shrink-0 text-rose-800">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-200 text-rose-900">
                              Perhatian H-1
                            </span>
                            <span className="text-xs font-medium text-rose-800">Tenggat Waktu Besok!</span>
                          </div>
                          <p className="text-sm font-semibold text-rose-950 mt-0.5">
                            Terdapat {tugasH1List.length} tugas aktif yang harus diselesaikan esok hari:{' '}
                            <span className="underline decoration-rose-400">
                              {tugasH1List.map((t) => `"${t.nama_tugas}"`).join(', ')}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleOpenKerjakan(tugasH1List[0])}
                          className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white font-medium text-xs rounded-lg shadow-xs transition"
                        >
                          Kerjakan Sekarang
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. KARTU METRIK */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                  {/* Kartu 1: Total File (Klik untuk membuka Rincian Berkas & Unduh) */}
                  <button
                    type="button"
                    onClick={() => setModalRincianFileOpen(true)}
                    className="text-left bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total File</p>
                        <h3 className="text-2xl sm:text-3xl font-bold text-[#1E293B] mt-1">{metrics.totalFile}</h3>
                        <p className="text-[11px] text-blue-600 font-medium mt-1">
                          {metrics.fileMateriCount} Materi &bull; {metrics.fileTugasCount} Tugas (Klik Rincian)
                        </p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Files className="w-6 h-6" />
                      </div>
                    </div>
                  </button>

                  {/* Kartu 2: Tugas Aktif */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-amber-300 transition-all">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Tugas Aktif</p>
                        <h3 className="text-2xl sm:text-3xl font-bold text-[#1E293B] mt-1">{metrics.tugasAktif}</h3>
                        <p className="text-[11px] text-amber-600 font-medium mt-1">
                          {metrics.overdueCount > 0 ? `${metrics.overdueCount} Terlambat • ` : ''}Belum Selesai
                        </p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <Clock className="w-6 h-6" />
                      </div>
                    </div>
                  </div>

                  {/* Kartu 3: Total Materi */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-all sm:col-span-2 md:col-span-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Materi</p>
                        <h3 className="text-2xl sm:text-3xl font-bold text-[#1E293B] mt-1">{metrics.totalMateri}</h3>
                        <p className="text-[11px] text-emerald-600 font-medium mt-1">Dokumen & modul perkuliahan</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <BookMarked className="w-6 h-6" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. TABEL TUGAS AKTIF */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h2 className="text-lg font-bold text-[#1E293B] tracking-tight">Daftar Tugas Aktif</h2>
                      <p className="text-xs text-slate-500">Tugas perkuliahan yang perlu dikerjakan atau diselesaikan</p>
                    </div>
                  </div>

                  {tugasAktifTable.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            <th className="py-3.5 px-4 sm:px-6">Mata Kuliah</th>
                            <th className="py-3.5 px-4 sm:px-6">Nama Tugas & Deskripsi</th>
                            <th className="py-3.5 px-4 sm:px-6">Tenggat Waktu</th>
                            <th className="py-3.5 px-4 sm:px-6 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {tugasAktifTable.map((t) => (
                            <tr key={t.id_tugas} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-4 px-4 sm:px-6 align-top">
                                <span className="font-semibold text-slate-900 block">{t.nama_matkul}</span>
                                <span className="text-xs text-slate-400 block">{t.dosen_pengampu}</span>
                              </td>

                              <td className="py-4 px-4 sm:px-6 align-top max-w-md">
                                <div className="font-semibold text-slate-900">{t.nama_tugas}</div>
                                <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                                  {t.deskripsi || 'Tidak ada deskripsi rinci.'}
                                </div>
                              </td>

                              <td className="py-4 px-4 sm:px-6 align-top whitespace-nowrap">
                                <div className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{t.tenggat_waktu}</span>
                                </div>
                                {t.autoStatus.label === 'Terlambat' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 mt-1">
                                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                                    Terlambat
                                  </span>
                                ) : t.autoStatus.label === 'Proses' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 mt-1">
                                    &bull; Sedang Dikerjakan
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 mt-1">
                                    &bull; Belum Dikerjakan
                                  </span>
                                )}
                              </td>

                              <td className="py-4 px-4 sm:px-6 align-top text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleOpenKerjakan(t)}
                                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition active:scale-95"
                                >
                                  <PenTool className="w-3.5 h-3.5" />
                                  <span>Kerjakan</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 px-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-semibold text-slate-800">Semua Tugas Telah Selesai!</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        {matkulList.length === 0
                          ? 'Belum ada tugas aktif. Tambahkan mata kuliah dan tugas baru atau muat data contoh.'
                          : 'Tidak ada tugas yang menunggu pengerjaan saat ini. Kerja bagus!'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: MANAJEMEN MATA KULIAH */}
            {activeTab === 'matakuliah' && (
              <div>
                {!selectedMatkulId ? (
                  /* VIEW 1: DAFTAR KELAS */
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
                      <div>
                        <h1 className="text-2xl font-bold text-[#1E293B] tracking-tight">Manajemen Mata Kuliah</h1>
                        <p className="text-xs text-slate-500 mt-1">Kelola kelas, jadwal kuliah, materi perkuliahan, dan tugas</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!requireSignedIn()) return;
                          setModalTambahMatkulOpen(true);
                        }}
                        className="inline-flex items-center space-x-2 px-4 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition active:scale-95 self-start sm:self-auto"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Tambah Mata Kuliah</span>
                      </button>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      {matkulList.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-sm">
                            <thead>
                              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                <th className="py-3.5 px-4 sm:px-6">Nama Mata Kuliah</th>
                                <th className="py-3.5 px-4 sm:px-6">Dosen Pengampu</th>
                                <th className="py-3.5 px-4 sm:px-6">Jadwal Kuliah</th>
                                <th className="py-3.5 px-4 sm:px-6 text-center">Materi / Tugas</th>
                                <th className="py-3.5 px-4 sm:px-6 text-right">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {matkulList.map((m) => {
                                const matCount = materiList.filter((mat) => mat.id_matkul === m.id_matkul).length;
                                const tugCount = tugasList.filter((t) => t.id_matkul === m.id_matkul).length;

                                return (
                                  <tr key={m.id_matkul} className="hover:bg-slate-50/60 transition-colors">
                                    <td className="py-4 px-4 sm:px-6">
                                      <button
                                        onClick={() => setSelectedMatkulId(m.id_matkul)}
                                        className="font-bold text-slate-900 hover:text-blue-600 flex items-center gap-1.5 transition text-left"
                                      >
                                        <span>{m.nama_matkul}</span>
                                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                      </button>
                                    </td>

                                    <td className="py-4 px-4 sm:px-6 text-slate-700 text-xs">{m.dosen_pengampu}</td>

                                    <td className="py-4 px-4 sm:px-6 text-xs text-slate-600">
                                      <span className="font-semibold text-slate-800">{m.hari}</span> &middot; {m.jam}
                                    </td>

                                    <td className="py-4 px-4 sm:px-6 text-center text-xs text-slate-600 font-medium">
                                      {matCount} Materi / {tugCount} Tugas
                                    </td>

                                    <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap space-x-1">
                                      <button
                                        onClick={() => setSelectedMatkulId(m.id_matkul)}
                                        className="inline-flex items-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                        title="Buka Detail Kelas"
                                      >
                                        <FolderOpen className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (!requireSignedIn()) return;
                                          setEditingMatkul(m);
                                          setModalEditMatkulOpen(true);
                                        }}
                                        className="p-2 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                                        title="Edit Mata Kuliah"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (!requireSignedIn()) return;
                                          setDeletingMatkul(m);
                                          setModalHapusMatkulOpen(true);
                                        }}
                                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                        title="Hapus Mata Kuliah"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-12 px-4">
                          <p className="text-sm text-slate-500">Belum ada mata kuliah yang terdaftar di database cloud.</p>
                          <div className="mt-3 flex items-center justify-center gap-2">
                            <button
                              onClick={handleSeedSampleData}
                              disabled={isSeeding}
                              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold"
                            >
                              Muat Data Contoh
                            </button>
                            <button
                              onClick={() => {
                                if (!requireSignedIn()) return;
                                setModalTambahMatkulOpen(true);
                              }}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold"
                            >
                              Tambah Kelas Pertama
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* VIEW 2: DETAIL KELAS */
                  <div className="space-y-6">
                    <nav className="flex items-center space-x-2 text-xs text-slate-500">
                      <button
                        onClick={() => {
                          setActiveTab('dashboard');
                          setSelectedMatkulId(null);
                        }}
                        className="hover:text-blue-600 transition flex items-center gap-1"
                      >
                        <Home className="w-3.5 h-3.5" />
                        <span>Dashboard</span>
                      </button>
                      <span>/</span>
                      <button onClick={() => setSelectedMatkulId(null)} className="hover:text-blue-600 transition">
                        Mata Kuliah
                      </button>
                      <span>/</span>
                      <span className="text-slate-800 font-semibold">{selectedMatkul?.nama_matkul}</span>
                    </nav>

                    {/* Header Kelas Info */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-[#1E293B]">{selectedMatkul?.nama_matkul}</h1>
                        <p className="text-xs text-slate-500 mt-1 flex items-center flex-wrap gap-x-3 gap-y-1">
                          <span>
                            <strong className="text-slate-700">Dosen:</strong> {selectedMatkul?.dosen_pengampu}
                          </span>
                          <span>&bull;</span>
                          <span>
                            <strong className="text-slate-700">Jadwal:</strong> {selectedMatkul?.hari}, {selectedMatkul?.jam}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 self-start md:self-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (!requireSignedIn()) return;
                            setModalUnggahMateriOpen(true);
                          }}
                          className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition"
                        >
                          <FileUp className="w-3.5 h-3.5" />
                          <span>Unggah Materi</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!requireSignedIn()) return;
                            setModalTambahTugasOpen(true);
                          }}
                          className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Buat Tugas</span>
                        </button>
                      </div>
                    </div>

                    {/* Search Bar Detail Kelas */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-3 flex-wrap">
                      <div className="relative flex-1 min-w-[240px] max-w-md">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                        <input
                          type="text"
                          value={detailSearchQuery}
                          onChange={(e) => setDetailSearchQuery(e.target.value)}
                          placeholder="Cari materi kuliah atau tugas pada kelas ini (tanpa scroll)..."
                          className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                        />
                        {detailSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setDetailSearchQuery('')}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        {detailSearchQuery ? (
                          <>
                            <span>
                              Ditemukan: <strong>{filteredSelectedMateri.length}</strong> materi &{' '}
                              <strong>{filteredSelectedTugas.length}</strong> tugas
                            </span>
                            <button
                              type="button"
                              onClick={() => setDetailSearchQuery('')}
                              className="text-xs font-semibold text-blue-600 hover:underline"
                            >
                              Hapus filter
                            </button>
                          </>
                        ) : (
                          <span>
                            Menampilkan seluruh {selectedMateriList.length} materi & {selectedTugasList.length} tugas
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 2 KOLOM: KIRI MATERI, KANAN TUGAS */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* KOLOM KIRI: DAFTAR MATERI */}
                      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col">
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                              <BookOpen className="w-4 h-4" />
                            </div>
                            <div>
                              <h2 className="text-base font-bold text-[#1E293B]">Materi Perkuliahan</h2>
                              <p className="text-[11px] text-slate-400">
                                Total {filteredSelectedMateri.length} modul & materi tersedia
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!requireSignedIn()) return;
                              setModalUnggahMateriOpen(true);
                            }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Unggah</span>
                          </button>
                        </div>

                        {filteredSelectedMateri.length > 0 ? (
                          <div className="space-y-3 flex-1">
                            {filteredSelectedMateri.map((m) => (
                              <div
                                key={m.id_materi}
                                className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition flex items-start justify-between gap-3"
                              >
                                <div>
                                  <h4 className="text-xs font-semibold text-[#1E293B] leading-snug">{m.judul_materi}</h4>
                                  <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    <span>Pertemuan ke-{m.pertemuan}</span>
                                  </p>
                                </div>

                                <div className="flex items-center space-x-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={downloadingKey === `mat-${m.id_materi}`}
                                    onClick={() =>
                                      handleDownloadFile(`mat-${m.id_materi}`, m.file_path, m.file_id, {
                                        title: m.judul_materi,
                                        subtitle: `Pertemuan ke-${m.pertemuan}`,
                                        description: `Modul perkuliahan: ${m.judul_materi}`,
                                      })
                                    }
                                    className="px-2.5 py-1 bg-white border border-slate-200 hover:border-blue-400 text-blue-600 text-xs font-medium rounded-lg flex items-center gap-1 transition disabled:opacity-60"
                                    title="Unduh Modul"
                                  >
                                    {downloadingKey === `mat-${m.id_materi}` ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Download className="w-3 h-3" />
                                    )}
                                    <span>Unduh</span>
                                  </button>
                                  <button
                                    onClick={() => handleHapusMateri(m)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                                    title="Hapus Materi"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : detailSearchQuery ? (
                          <div className="text-center py-10 my-auto text-slate-400">
                            <Search className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="text-xs">Tidak ada materi yang cocok dengan "{detailSearchQuery}".</p>
                          </div>
                        ) : (
                          <div className="text-center py-10 my-auto text-slate-400">
                            <FileQuestion className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="text-xs">Belum ada materi perkuliahan yang diunggah.</p>
                          </div>
                        )}
                      </div>

                      {/* KOLOM KANAN: DAFTAR TUGAS */}
                      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col">
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                              <CheckSquare className="w-4 h-4" />
                            </div>
                            <div>
                              <h2 className="text-base font-bold text-[#1E293B]">Tugas & Kuis</h2>
                              <p className="text-[11px] text-slate-400">Total {filteredSelectedTugas.length} tugas terdaftar</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!requireSignedIn()) return;
                              setModalTambahTugasOpen(true);
                            }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Tambah</span>
                          </button>
                        </div>

                        {filteredSelectedTugas.length > 0 ? (
                          <div className="space-y-3 flex-1">
                            {filteredSelectedTugas.map((t) => (
                              <div
                                key={t.id_tugas}
                                className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-[#1E293B]">{t.nama_tugas}</span>
                                      {(() => {
                                        const autoStatus = getAutomatedTaskStatus(t);
                                        if (autoStatus.label === 'Selesai') {
                                          return (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                              <CheckCircle className="w-3 h-3 text-emerald-600" /> Selesai
                                            </span>
                                          );
                                        }
                                        if (autoStatus.label === 'Terlambat') {
                                          return (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 flex items-center gap-1">
                                              <AlertTriangle className="w-3 h-3 text-rose-600" /> Terlambat
                                            </span>
                                          );
                                        }
                                        if (autoStatus.label === 'Proses') {
                                          return (
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                              Sedang Dikerjakan
                                            </span>
                                          );
                                        }
                                        return (
                                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                                            Belum Dikerjakan
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">{t.deskripsi || 'Tidak ada catatan tugas.'}</p>
                                  </div>
                                  <button
                                    onClick={() => handleHapusTugas(t)}
                                    className="p-1 text-slate-300 hover:text-rose-600 rounded transition"
                                    title="Hapus Tugas"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-xs flex-wrap gap-2">
                                  <div className="flex items-center text-slate-500 text-[11px] gap-1">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    <span>Tenggat: {t.tenggat_waktu}</span>
                                  </div>

                                  <div className="flex items-center space-x-2">
                                    {t.file_jawaban && (
                                      <button
                                        type="button"
                                        disabled={downloadingKey === `tug-${t.id_tugas}`}
                                        onClick={() =>
                                          handleDownloadFile(`tug-${t.id_tugas}`, t.file_jawaban!, t.file_id, {
                                            title: t.nama_tugas,
                                            subtitle: `Tenggat: ${t.tenggat_waktu}`,
                                            description: t.catatan_jawaban || t.deskripsi || 'Berkas jawaban tugas.',
                                          })
                                        }
                                        className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-medium disabled:opacity-60"
                                      >
                                        {downloadingKey === `tug-${t.id_tugas}` ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Download className="w-3 h-3" />
                                        )}
                                        <span>Unduh Jawaban</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenKerjakan(t)}
                                      className="px-2.5 py-1 bg-[#2563EB] hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition"
                                    >
                                      {getAutomatedTaskStatus(t).label === 'Selesai' ? 'Perbarui Jawaban' : 'Kumpul / Kerjakan'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : detailSearchQuery ? (
                          <div className="text-center py-10 my-auto text-slate-400">
                            <Search className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="text-xs">Tidak ada tugas yang cocok dengan "{detailSearchQuery}".</p>
                          </div>
                        ) : (
                          <div className="text-center py-10 my-auto text-slate-400">
                            <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="text-xs">Belum ada tugas atau ujian untuk mata kuliah ini.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ======================================================== */}
      {/* MODAL POP-UP: KERJAKAN TUGAS */}
      {/* ======================================================== */}
      {modalKerjakanOpen && activeTaskForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-[#1E293B]">Kerjakan Tugas</h3>
                <p className="text-xs text-slate-500">Perbarui status dan unggah jawaban mahasiswa ke cloud</p>
              </div>
              <button
                type="button"
                onClick={() => setModalKerjakanOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveKerjakan} className="p-5 space-y-4">
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs">
                <p className="text-blue-900 font-semibold">{activeTaskForModal.nama_tugas}</p>
                <p className="text-slate-600 mt-1">{activeTaskForModal.deskripsi || 'Tidak ada deskripsi rinci.'}</p>
                <p className="text-slate-400 text-[10px] mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Tenggat: {activeTaskForModal.tenggat_waktu}</span>
                </p>
              </div>

              {/* Status Otomatis & Ketentuan Berkas */}
              <div className="p-3 rounded-xl border text-xs bg-slate-50/80 border-slate-200">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-semibold text-slate-700">Status Pengerjaan (Otomatis):</span>
                  {kerjakanFileName ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      Selesai (Berkas Terlampir)
                    </span>
                  ) : new Date() > new Date(activeTaskForModal.tenggat_waktu.replace(' ', 'T')) ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      Terlambat (Waktu Habis & Belum Ada Berkas)
                    </span>
                  ) : kerjakanStatus === 'Proses' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Sedang Dikerjakan (Proses)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      Belum Dikerjakan
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  {kerjakanFileName ? (
                    <span className="text-emerald-700 font-medium">
                      ✓ Berkas jawaban telah dilampirkan dan tersimpan di cloud agar dapat diunduh siapa saja.
                    </span>
                  ) : (
                    <span className="text-slate-500">
                      ℹ Tugas hanya dinyatakan <strong>Selesai</strong> jika Anda mengunggah berkas jawaban.
                    </span>
                  )}
                </p>
              </div>

              {/* Unggah Berkas Jawaban */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Unggah Berkas Jawaban (PDF / ZIP / DOCX)
                  </label>
                  <span className="text-[10px] text-blue-600 font-semibold">Maks. 4MB (Cloud)</span>
                </div>
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > MAX_CLOUD_FILE_BYTES) {
                        showToast('Ukuran file maksimal 4MB untuk penyimpanan cloud.', 'danger');
                        e.target.value = '';
                        return;
                      }
                      setKerjakanSelectedFile(file);
                      setKerjakanFileName(file.name);
                      setKerjakanStatus('Selesai');
                    }
                  }}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-slate-200 rounded-lg cursor-pointer"
                />
                {kerjakanFileName ? (
                  <div className="mt-2 p-2 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-between text-xs">
                    <span className="text-emerald-800 font-medium flex items-center gap-1.5 truncate">
                      <FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{kerjakanFileName}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setKerjakanSelectedFile(null);
                        setKerjakanFileName('');
                        setKerjakanStatus('Belum Dimulai');
                      }}
                      className="text-xs text-rose-600 hover:underline font-semibold ml-2 shrink-0"
                    >
                      Hapus Berkas
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Pilih file jawaban dari komputer/HP Anda untuk menyelesaikan tugas ini.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Catatan Tambahan / Link Jawaban</label>
                <textarea
                  rows={3}
                  value={kerjakanCatatan}
                  onChange={(e) => setKerjakanCatatan(e.target.value)}
                  placeholder="Tuliskan catatan pengerjaan atau link repository GitHub / Google Drive..."
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalKerjakanOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingKerjakan}
                  className="px-4 py-2 text-xs font-semibold bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg shadow-xs transition inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isSubmittingKerjakan && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmittingKerjakan ? 'Mengunggah...' : 'Simpan Progres'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL POP-UP: RINCIAN PELACAKAN BERKAS */}
      {/* ======================================================== */}
      {modalRincianFileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[#1E293B]">Pelacakan Total Berkas File</h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    {metrics.totalFile} Berkas
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Menghitung seluruh modul materi perkuliahan ({metrics.fileMateriCount}) dan berkas tugas ({metrics.fileTugasCount})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalRincianFileOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 pt-3 border-b border-slate-100 flex items-center gap-2 bg-white">
              <button
                onClick={() => setActiveFileFilter('all')}
                className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeFileFilter === 'all'
                    ? 'border-[#2563EB] text-[#2563EB]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Semua Berkas ({metrics.totalFile})
              </button>
              <button
                onClick={() => setActiveFileFilter('materi')}
                className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeFileFilter === 'materi'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                <span>Materi Kuliah ({metrics.fileMateriCount})</span>
              </button>
              <button
                onClick={() => setActiveFileFilter('tugas')}
                className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeFileFilter === 'tugas'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Berkas Tugas ({metrics.fileTugasCount})</span>
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1 bg-slate-50/30">
              {(activeFileFilter === 'all' || activeFileFilter === 'materi') && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Modul & Slide Materi Kuliah ({metrics.fileMateriCount})</span>
                  </div>

                  {materiList.filter((m) => Boolean(m.file_path)).length > 0 ? (
                    <div className="space-y-2">
                      {materiList
                        .filter((m) => Boolean(m.file_path))
                        .map((m) => {
                          const matkul = matkulList.find((mk) => mk.id_matkul === m.id_matkul);
                          return (
                            <div
                              key={`mat-${m.id_materi}`}
                              className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3 hover:border-emerald-200 transition"
                            >
                              <div className="flex items-center space-x-3 overflow-hidden">
                                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                  <Files className="w-4 h-4" />
                                </div>
                                <div className="truncate">
                                  <h4 className="text-xs font-bold text-[#1E293B] truncate">{m.judul_materi}</h4>
                                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                    <span className="text-slate-600 font-medium">{matkul?.nama_matkul || 'Mata Kuliah'}</span> &middot; Pertemuan {m.pertemuan} &middot;{' '}
                                    <code className="text-slate-500 font-mono text-[10px]">{m.file_path}</code>
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={downloadingKey === `modal-mat-${m.id_materi}`}
                                onClick={() =>
                                  handleDownloadFile(`modal-mat-${m.id_materi}`, m.file_path, m.file_id, {
                                    title: m.judul_materi,
                                    subtitle: `${matkul?.nama_matkul || 'Mata Kuliah'} - Pertemuan ${m.pertemuan}`,
                                    description: `Modul perkuliahan: ${m.judul_materi}`,
                                  })
                                }
                                className="px-3 py-1.5 bg-slate-50 hover:bg-emerald-50 text-emerald-700 border border-slate-200 hover:border-emerald-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0 transition disabled:opacity-60"
                              >
                                {downloadingKey === `modal-mat-${m.id_materi}` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                                <span>Unduh</span>
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                      Tidak ada berkas materi tersimpan.
                    </div>
                  )}
                </div>
              )}

              {(activeFileFilter === 'all' || activeFileFilter === 'tugas') && (
                <div className="space-y-2 pt-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Berkas Jawaban & Lampiran Tugas ({metrics.fileTugasCount})</span>
                  </div>

                  {tugasList.filter((t) => Boolean(t.file_jawaban)).length > 0 ? (
                    <div className="space-y-2">
                      {tugasList
                        .filter((t) => Boolean(t.file_jawaban))
                        .map((t) => {
                          const matkul = matkulList.find((mk) => mk.id_matkul === t.id_matkul);
                          return (
                            <div
                              key={`tug-${t.id_tugas}`}
                              className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3 hover:border-blue-200 transition"
                            >
                              <div className="flex items-center space-x-3 overflow-hidden">
                                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                  <FileCheck className="w-4 h-4" />
                                </div>
                                <div className="truncate">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-bold text-[#1E293B] truncate">{t.nama_tugas}</h4>
                                    <span
                                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                        getAutomatedTaskStatus(t).label === 'Selesai'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {getAutomatedTaskStatus(t).label}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                    <span className="text-slate-600 font-medium">{matkul?.nama_matkul || 'Mata Kuliah'}</span> &middot;{' '}
                                    <code className="text-slate-500 font-mono text-[10px]">{t.file_jawaban}</code>
                                    {t.catatan_jawaban && ` — "${t.catatan_jawaban}"`}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={downloadingKey === `modal-tug-${t.id_tugas}`}
                                onClick={() =>
                                  handleDownloadFile(`modal-tug-${t.id_tugas}`, t.file_jawaban!, t.file_id, {
                                    title: t.nama_tugas,
                                    subtitle: `${matkul?.nama_matkul || 'Mata Kuliah'} - Tenggat: ${t.tenggat_waktu}`,
                                    description: t.catatan_jawaban || t.deskripsi || 'Berkas jawaban tugas.',
                                  })
                                }
                                className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-blue-700 border border-slate-200 hover:border-blue-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0 transition disabled:opacity-60"
                              >
                                {downloadingKey === `modal-tug-${t.id_tugas}` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                                <span>Unduh</span>
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                      Belum ada berkas jawaban tugas yang diunggah. Unggah berkas via tombol "Kerjakan" pada tugas aktif.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs text-slate-500 font-medium">
                Total terdeteksi di database cloud: <strong className="text-slate-800">{metrics.totalFile} Berkas</strong>
              </span>
              <button
                type="button"
                onClick={() => setModalRincianFileOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xs transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL POP-UP: TAMBAH MATA KULIAH */}
      {modalTambahMatkulOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-lg overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-base font-bold text-[#1E293B]">Tambah Mata Kuliah</h3>
              <button onClick={() => setModalTambahMatkulOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleTambahMatkul} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nama Mata Kuliah</label>
                <input
                  type="text"
                  required
                  value={newMatkul.nama_matkul}
                  onChange={(e) => setNewMatkul({ ...newMatkul, nama_matkul: e.target.value })}
                  placeholder="Contoh: Pemrograman Mobile"
                  className="w-full text-xs py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Dosen Pengampu</label>
                <input
                  type="text"
                  required
                  value={newMatkul.dosen_pengampu}
                  onChange={(e) => setNewMatkul({ ...newMatkul, dosen_pengampu: e.target.value })}
                  placeholder="Contoh: Dr. Ir. Budi Santoso, M.T."
                  className="w-full text-xs py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Hari</label>
                  <select
                    value={newMatkul.hari}
                    onChange={(e) => setNewMatkul({ ...newMatkul, hari: e.target.value })}
                    className="w-full text-xs py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  >
                    <option value="Senin">Senin</option>
                    <option value="Selasa">Selasa</option>
                    <option value="Rabu">Rabu</option>
                    <option value="Kamis">Kamis</option>
                    <option value="Jumat">Jumat</option>
                    <option value="Sabtu">Sabtu</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jam Kuliah</label>
                  <input
                    type="text"
                    required
                    value={newMatkul.jam}
                    onChange={(e) => setNewMatkul({ ...newMatkul, jam: e.target.value })}
                    placeholder="08.00 - 10.30"
                    className="w-full text-xs py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalTambahMatkulOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg shadow-xs"
                >
                  Simpan Kelas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL POP-UP: EDIT MATA KULIAH */}
      {modalEditMatkulOpen && editingMatkul && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-lg overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-base font-bold text-[#1E293B]">Edit Mata Kuliah</h3>
              <button onClick={() => setModalEditMatkulOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditMatkul} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nama Mata Kuliah</label>
                <input
                  type="text"
                  required
                  value={editingMatkul.nama_matkul}
                  onChange={(e) => setEditingMatkul({ ...editingMatkul, nama_matkul: e.target.value })}
                  className="w-full text-xs py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Dosen Pengampu</label>
                <input
                  type="text"
                  required
                  value={editingMatkul.dosen_pengampu}
                  onChange={(e) => setEditingMatkul({ ...editingMatkul, dosen_pengampu: e.target.value })}
                  className="w-full text-xs py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Hari</label>
                  <select
                    value={editingMatkul.hari}
                    onChange={(e) => setEditingMatkul({ ...editingMatkul, hari: e.target.value })}
                    className="w-full text-xs py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  >
                    <option value="Senin">Senin</option>
                    <option value="Selasa">Selasa</option>
                    <option value="Rabu">Rabu</option>
                    <option value="Kamis">Kamis</option>
                    <option value="Jumat">Jumat</option>
                    <option value="Sabtu">Sabtu</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jam Kuliah</label>
                  <input
                    type="text"
                    required
                    value={editingMatkul.jam}
                    onChange={(e) => setEditingMatkul({ ...editingMatkul, jam: e.target.value })}
                    className="w-full text-xs py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalEditMatkulOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg shadow-xs"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL POP-UP: KONFIRMASI HAPUS MATA KULIAH */}
      {modalHapusMatkulOpen && deletingMatkul && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-lg overflow-hidden border border-slate-200 p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#1E293B]">Hapus Mata Kuliah?</h3>
            <p className="text-xs text-slate-500 mt-1">
              Anda akan menghapus <span className="font-semibold text-slate-800">"{deletingMatkul.nama_matkul}"</span>. Seluruh data materi dan tugas di dalamnya akan terhapus permanen.
            </p>
            <div className="mt-5 flex items-center justify-center space-x-2">
              <button
                type="button"
                onClick={() => setModalHapusMatkulOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmHapusMatkul}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL POP-UP: UNGGAH MATERI */}
      {modalUnggahMateriOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-lg overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-base font-bold text-[#1E293B]">Unggah Materi Perkuliahan</h3>
              <button onClick={() => setModalUnggahMateriOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleTambahMateri} className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Pertemuan Ke-</label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={newMateri.pertemuan}
                    onChange={(e) => setNewMateri({ ...newMateri, pertemuan: Number(e.target.value) })}
                    required
                    className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Judul Materi</label>
                  <input
                    type="text"
                    required
                    value={newMateri.judul_materi}
                    onChange={(e) => setNewMateri({ ...newMateri, judul_materi: e.target.value })}
                    placeholder="Contoh: Desain RESTful API"
                    className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Pilih Berkas Slide / PDF</label>
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > MAX_CLOUD_FILE_BYTES) {
                        showToast('Ukuran file maksimal 4MB untuk penyimpanan cloud.', 'danger');
                        e.target.value = '';
                        return;
                      }
                      setNewMateri((prev) => ({
                        ...prev,
                        fileName: f.name,
                        fileObj: f,
                      }));
                    }
                  }}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-slate-200 rounded-lg cursor-pointer"
                />
                <p className="text-[10px] text-slate-400 mt-1">Format: PDF, PPTX, DOCX, ZIP (Maks. 4MB Cloud)</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalUnggahMateriOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMateri}
                  className="px-4 py-2 text-xs font-semibold bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg shadow-xs inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isSubmittingMateri && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmittingMateri ? 'Mengunggah...' : 'Simpan Berkas'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL POP-UP: TAMBAH TUGAS */}
      {modalTambahTugasOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-lg overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-base font-bold text-[#1E293B]">Buat Tugas Baru</h3>
              <button onClick={() => setModalTambahTugasOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleTambahTugas} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nama Tugas</label>
                <input
                  type="text"
                  required
                  value={newTugas.nama_tugas}
                  onChange={(e) => setNewTugas({ ...newTugas, nama_tugas: e.target.value })}
                  placeholder="Contoh: Tugas 2 - Perancangan Skema DB"
                  className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tenggat Waktu</label>
                <input
                  type="datetime-local"
                  required
                  value={newTugas.tenggat_waktu}
                  onChange={(e) => setNewTugas({ ...newTugas, tenggat_waktu: e.target.value })}
                  className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Deskripsi / Petunjuk</label>
                <textarea
                  rows={3}
                  value={newTugas.deskripsi}
                  onChange={(e) => setNewTugas({ ...newTugas, deskripsi: e.target.value })}
                  placeholder="Tuliskan petunjuk pengerjaan atau format file..."
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalTambahTugasOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg shadow-xs"
                >
                  Simpan Tugas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-400 mt-auto">
        <div className="max-w-7xl mx-auto px-4">
          &copy; 2026 Sistem Manajemen Perkuliahan &middot; Muhamad Azlan Farizki (240511200)
        </div>
      </footer>
    </div>
  );
}
