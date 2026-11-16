# Security Specification & Red Team Audit Plan

## 1. Data Invariants
1. **Course Integrity:** Every `materi` and `tugas` document must reference a valid `id_matkul` that exists (or is atomically created in the same batch via `existsAfter`) in `/matakuliah/{matkulId}`.
2. **File Chunk Integrity:** Every `/files/{fileId}/chunks/{chunkId}` document must belong to an existing parent `/files/{fileId}` document whose `ownerUid` matches `request.auth.uid` (or admin), and `isPublic` matches the parent visibility.
3. **Identity & Immutability:** `ownerUid` and `createdAt` are immutable after document creation. Timestamps (`createdAt`, `updatedAt`) must equal `request.time`.
4. **Verified Writes Only:** All write operations (`create`, `update`, `delete`) require `request.auth != null && request.auth.token.email_verified == true`.
5. **Public Non-PII Course Read:** Because the academic dashboard and answer downloads must be accessible to anyone (including lecturers across devices without forced login), `matakuliah`, `materi`, `tugas`, `files`, and `chunks` explicitly require `resource.data.isPublic == true` in `allow get` and `allow list` (no PII fields are stored in Firestore).

## 2. The "Dirty Dozen" Attack Payloads (All Must Return `PERMISSION_DENIED`)
1. **Shadow Field Injection on `matakuliah` create:** `{ nama_matkul: "Web", dosen_pengampu: "Dosen", hari: "Senin", jam: "08:00", isPublic: true, ownerUid: "<uid>", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), isVerifiedAdmin: true }` -> Blocked by `keys().hasOnly(...)`.
2. **Owner Spoofing on `matakuliah` create:** `ownerUid: "someone_elses_uid"` -> Blocked by `incoming().ownerUid == request.auth.uid`.
3. **Client Timestamp Forgery on `tugas` create:** `createdAt: Timestamp(2020-01-01)` -> Blocked by `incoming().createdAt == request.time`.
4. **Oversized ID Poisoning (`> 128` chars) on `tugas/{tugasId}`:** `tugasId = "a".repeat(500)` -> Blocked by `isValidId(tugasId)`.
5. **Regex Poisoning on `id_matkul`:** `id_matkul: "../admin/secret"` -> Blocked by `id.matches('^[a-zA-Z0-9_\\-]+$')`.
6. **Orphaned `tugas` Creation:** `id_matkul: "non_existent_course_999"` -> Blocked by `existsAfter(/databases/$(database)/documents/matakuliah/$(incoming().id_matkul))`.
7. **Unverified Email Spoofing:** Authenticated user with `email_verified: false` attempting `create`/`update` -> Blocked by `request.auth.token.email_verified == true`.
8. **Tier-2 Privilege Escalation on `tugas` update:** Non-owner student attempting to modify `nama_tugas` or `tenggat_waktu` during submission -> Blocked by `affectedKeys().hasOnly(['status', 'file_jawaban', 'file_id', 'catatan_jawaban', 'submittedByUid', 'submittedByName', 'updatedAt'])`.
9. **Immutable `createdAt` / `ownerUid` Tampering on update:** Changing `ownerUid` or `createdAt` -> Blocked by `incoming().ownerUid == existing().ownerUid && incoming().createdAt == existing().createdAt`.
10. **Invalid Enum Value on `tugas`:** `status: "LulusInstan"` -> Blocked by `data.status in ['Belum Dimulai', 'Proses', 'Selesai']`.
11. **Oversized String DoS on `deskripsi`:** `deskripsi = "x".repeat(5000)` -> Blocked by `data.deskripsi.size() <= 2000`.
12. **Unfiltered / Private Collection Scrape:** Listing documents where `isPublic == false` as a non-owner -> Blocked by `allow list: if resource.data.isPublic == true || ...`.
