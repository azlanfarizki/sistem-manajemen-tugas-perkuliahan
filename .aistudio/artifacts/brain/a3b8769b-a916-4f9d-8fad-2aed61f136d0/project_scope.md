# DOKUMEN LINGKUP PROYEK (PROJECT SCOPE)
## SISTEM MANAJEMEN PERKULIAHAN & TUGAS MAHASISWA

---

### 1. INFORMASI PROYEK
- **Nama Proyek:** Sistem Manajemen Perkuliahan & Pengumpulan Tugas (Academic Course & Task Management System)
- **Kategori:** Web Application / Sistem Informasi Akademik Mandiri
- **Target Pengguna:** Mahasiswa dan Dosen Pengampu Mata Kuliah
- **Tujuan Utama:** Membantu mahasiswa mengelola jadwal mata kuliah, mengakses modul perkuliahan per pertemuan, serta memantau tenggat waktu dan pengumpulan berkas tugas secara otomatis dan terorganisir.

---

### 2. LATAR BELAKANG & TUJUAN
#### 2.1 Latar Belakang
Banyaknya mata kuliah dengan jadwal dan penugasan yang berbeda sering kali menimbulkan kendala bagi mahasiswa dalam melacak deadline, mengunduh materi kuliah, dan menyimpan riwayat berkas jawaban tugas yang telah dikerjakan. Sistem ini dirancang untuk menyediakan satu pusat kendali (*single centralized dashboard*) yang rapi, responsif, dan mudah diakses.

#### 2.2 Tujuan Proyek
1. **Sentralisasi Informasi:** Menggabungkan jadwal kuliah harian, repositori materi per pertemuan, dan daftar tugas dalam satu platform.
2. **Otomatisasi Status Tugas:** Menghilangkan kebingungan status pengerjaan tugas dengan verifikasi pengunggahan berkas jawaban (*Upload-verified completion*).
3. **Pencegahan Keterlambatan:** Memberikan sistem peringatan dini (Banner H-1 dan deteksi *Overdue*) terhadap tugas-tugas kritis.
4. **Pelacakan Berkas Terpusat:** Memfasilitasi penghitungan serta pengunduhan kembali berkas materi kuliah dan berkas jawaban mahasiswa.

---

### 3. RUANG LINGKUP FUNGSIONAL (IN-SCOPE)

#### Modul 1: Autentikasi & Profil Pengguna
- Halaman autentikasi interaktif (kartu flip login/register mahasiswa).
- Validasi Nomor Induk Mahasiswa (NIM), Nama Lengkap, dan Kata Sandi.
- Profil pengguna dengan ringkasan status akademik dan tombol *logout*.

#### Modul 2: Dasbor Analitik & Peringatan Dini
- **Kartu Metrik Utama:**
  - Total Berkas File (gabungan modul materi & jawaban tugas) beserta modal rincian berkas.
  - Total Tugas Aktif yang belum selesai.
  - Jumlah Tugas Terlambat (*Overdue*).
  - Total Modul Materi Perkuliahan yang tersedia.
- **Sistem Banner Peringatan H-1:** Otomatis menampilkan pemberitahuan mencolok jika terdapat tugas dengan tenggat waktu esok hari yang belum selesai.
- **Pencarian Cepat Global (Instant Search):** Pencarian terpadu melintasi data mata kuliah, materi, dan tugas tanpa *reload* halaman.

#### Modul 3: Manajemen Mata Kuliah (Kelas Kuliah)
- Menampilkan jadwal kuliah harian (hari, jam pelaksanaan, nama mata kuliah, dan nama dosen pengampu).
- Fitur Tambah Mata Kuliah baru dengan validasi form.
- Fitur Edit Data Mata Kuliah.
- Fitur Hapus Mata Kuliah (dilengkapi konfirmasi keamanan dan penghapusan relasional berkas/tugas terkait).
- Tampilan Detail Kelas dengan layout dua kolom terstruktur (Kolom Kiri: Materi, Kolom Kanan: Tugas).

#### Modul 4: Manajemen Materi Perkuliahan
- Unggah modul materi kuliah dengan atribut: nomor pertemuan (1–32), judul materi, dan lampiran berkas (PDF, PPTX, DOCX, ZIP).
- Filter dan pencarian khusus materi dalam kelas perkuliahan.
- Unduh berkas materi kuliah.
- Hapus modul materi yang tidak diperlukan.

#### Modul 5: Manajemen Tugas & Otomatisasi Status
- Pembuatan tugas baru dengan parameter: Nama Tugas, Batas Waktu (*Deadline*), dan Catatan/Petunjuk Pengerjaan.
- **Aturan Otomatisasi Status Tugas:**
  - **Belum Dikerjakan (Default):** Tugas yang baru dibuat secara otomatis berstatus belum dikerjakan. Tidak ada pemilihan status manual di form pembuatan.
  - **Sedang Dikerjakan (Proses):** Ditandai saat mahasiswa mulai mencatat progres pengerjaan namun belum mengunggah berkas jawaban.
  - **Selesai:** Sistem secara otomatis mengubah status tugas menjadi "Selesai" jika dan hanya jika mahasiswa telah mengunggah berkas jawaban (PDF/ZIP/DOCX).
  - **Terlambat:** Otomatis ditandai merah (*Overdue*) jika waktu saat ini telah melewati tanggal/jam tenggat waktu dan mahasiswa belum mengunggah berkas jawaban.
- Modal pengerjaan tugas (*Submission Modal*) yang menampilkan informasi tenggat, form unggah berkas jawaban, input catatan/tautan repositori (GitHub/Google Drive), dan opsi hapus berkas.

#### Modul 6: Pusat Berkas & Penyimpanan
- Modal inventaris seluruh file (`modalRincianFileOpen`) dengan filter kategori: Semua Berkas, Berkas Materi Kuliah, dan Berkas Jawaban Tugas.
- Mekanisme unduh langsung (*download trigger*) untuk setiap berkas yang terdata.

---

### 4. BATASAN SISTEM (OUT-OF-SCOPE)
Untuk menjaga ketepatan waktu rilis dan performa sistem, hal-hal berikut berada di luar cakupan rilis saat ini:
1. **Penilaian Otomatis / Grading:** Sistem tidak melakukan penilaian nilai angka/huruf secara otomatis menggunakan machine learning atau AI.
2. **Penyimpanan Cloud Berbayar Pihak Ketiga:** Berkas fisik saat ini disimpan dan dikelola melalui skema upload lokal / *LocalStorage* peramban atau folder server lokal (`uploads/`).
3. **Integrasi Pembayaran:** Tidak mencakup pembayaran SPP/BPP perkuliahan.
4. **Chatting Real-Time:** Komunikasi dosen dan mahasiswa tetap berfokus pada instruksi deskripsi tugas dan catatan jawaban.

---

### 5. SPESIFIKASI TEKNOLOGI (TECH STACK)
| Komponen | Teknologi | Penjelasan |
|---|---|---|
| **Frontend Framework** | React 19 + TypeScript | Komponen berbasis fungsi dengan strict typing |
| **Styling & UI** | Tailwind CSS v4 + Lucide Icons | Antarmuka modern, responsif desktop & mobile |
| **Build Tool** | Vite 8 | Kompilasi cepat dengan HMR super ringan |
| **State & Penyimpanan Data** | React Hooks + LocalStorage | Data persisten langsung di browser pengguna |
| **Opsi Backend Lokal** | Node.js (Express) / Python (Flask) + MySQL | Skema API CRUD untuk deployment database relasional |

---

### 6. RENCANA PENGEMBANGAN (MILESTONES)
- **Fase 1 (Selesai):** Pembuatan antarmuka pengguna (UI/UX), tata letak dasbor, dan integrasi LocalStorage.
- **Fase 2 (Selesai):** Perbaikan logika otomatisasi status tugas (syarat berkas jawaban), penyesuaian modal, dan perbaikan kompatibilitas instalasi lokal.
- **Fase 3 (Pengembangan Lanjutan):** Integrasi penuh API backend menggunakan Express.js atau Flask yang terhubung ke database relasional MySQL lokal.
