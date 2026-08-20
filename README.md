# Finance V2 Backend

Dokumentasi ini menjelaskan backend `finance_v2` yang berjalan saat ini: teknologi, struktur folder, environment, collection MongoDB, endpoint API, alur transaksi, summary engine v2, import, reconciliation, dan catatan maintenance.

## Ringkasan Project

Backend ini adalah API finance/accounting berbasis Express + MongoDB untuk project `finance_v2`.

Tujuan utama versi ini adalah memperbaiki struktur summary lama yang sulit diaudit dengan menjadikan:

```text
tt_finance_details sebagai sumber kebenaran transaksi
tt_summary_v2 sebagai summary/dashboard hasil kalkulasi
```

Collection lama seperti `tt_finance`, `tt_finance_daily`, `th_finance`, dan `th_finance_daily` tidak lagi menjadi sumber utama dashboard finance v2.

## Teknologi

- Node.js
- Express
- TypeScript
- MongoDB
- Mongoose
- JWT authentication
- bcrypt
- Multer untuk upload file
- ExcelJS untuk export Excel
- csv-parser untuk import CSV
- SimpleWebAuthn untuk security key/passkey
- Morgan untuk request logging
- dotenv untuk environment

## Struktur Folder Penting

```text
finance_v2/backend
├── src/
│   ├── config/
│   │   └── db.ts
│   ├── controllers/
│   │   ├── authController.ts
│   │   ├── dashboardController.ts
│   │   ├── fiscalController.ts
│   │   ├── masterController.ts
│   │   ├── perusahaanController.ts
│   │   ├── rekeningController.ts
│   │   ├── summaryV2Controller.ts
│   │   ├── transaksiController.ts
│   │   ├── ttFinanceDetailController.ts
│   │   └── userController.ts
│   ├── middleware/
│   │   ├── authMiddleware.ts
│   │   └── errorLoggerMiddleware.ts
│   ├── models/
│   ├── routes/
│   ├── scripts/
│   │   ├── ensure_summary_v2_unique_index.ts
│   │   ├── sync_indexes.ts
│   │   └── test_validate_attachment_transaction.ts
│   ├── services/
│   │   └── summaryV2Service.ts
│   ├── utils/
│   └── server.ts
├── uploads/
│   └── transaksi/
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

## Environment

Template environment ada di `.env.example`.

```env
PORT=5103
MONGO_URI=mongodb://localhost:27017/finance_v2
JWT_SECRET=change_this_to_a_strong_secret
DELETE_VALIDATED_SECRET_CODE=change_this_delete_secret_code
CORS_ORIGIN=http://localhost:5174
```

Catatan:

- `.env` lokal tidak boleh masuk git.
- `.gitignore` sudah mengabaikan `.env*` dan tetap mengizinkan `.env.example`.
- `uploads/` juga di-ignore karena berisi file runtime.

## Menjalankan Backend

Install dependency:

```bash
npm install
```

Development:

```bash
npm run dev
```

Build TypeScript:

```bash
npm run build
```

Production start setelah build:

```bash
npm start
```

Default server:

```text
http://localhost:5103
```

Health check:

```text
GET /api/health
```

## Script NPM

| Script | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan backend dengan `ts-node-dev` |
| `npm run build` | Compile TypeScript ke `dist/` |
| `npm start` | Menjalankan hasil build |
| `npm run seed-data` | Menjalankan seed runner |
| `npm run sync-indexes` | Sinkronisasi index Mongoose |
| `npm run ensure-summary-index` | Membuat/menjamin unique index `tt_summary_v2` |
| `npm run test:mongo-transaction` | Test rollback MongoDB transaction validate summary |

## Mount Route Utama

Route dipasang di `src/server.ts`.

| Prefix | Route File | Fungsi |
| --- | --- | --- |
| `/api/auth` | `authRoutes.ts` | Login, register, WebAuthn |
| `/api/transaksi` | `transaksiRoutes.ts` | Transaksi, attachment, import, validasi |
| `/api/dashboard` | `dashboardRoutes.ts` | Data dashboard dari `tt_summary_v2` |
| `/api/master` | `masterRoutes.ts` | Master kategori/subkategori/akun/perusahaan/bank/rekening |
| `/api/master/perusahaan` | `perusahaanRoutes.ts` | CRUD perusahaan |
| `/api/fiscal` | `fiscalRoutes.ts` | Fiscal year, tutup buku |
| `/api/users` | `userRoutes.ts` | Manajemen user |
| `/api/summary-v2` | `summaryV2Routes.ts` | Rebuild dan reconciliation summary |

## Authentication

Authentication menggunakan JWT.

Header:

```http
Authorization: Bearer <token>
```

Middleware:

```text
src/middleware/authMiddleware.ts
```

Beberapa endpoint read masih public/internal, tetapi endpoint write penting menggunakan `authenticate`.

## Role Penting

Role yang umum digunakan:

- `superuser`
- `corsec`
- `finance`

Aturan penting:

- Validasi transaksi: `superuser` atau `corsec`.
- Delete transaksi tervalidasi: hanya `superuser` dan wajib secret code.
- Tutup buku: `superuser` atau `corsec`.
- Rebuild summary: hanya `superuser`.
- Reconciliation summary: hanya `superuser`.
- User management: wajib login.

## Collection MongoDB Utama

### `tt_finance_details`

Model:

```text
src/models/TtFinanceDetail.ts
```

Fungsi:

- Sumber kebenaran transaksi.
- Semua transaksi baru/import masuk ke collection ini.
- Data soft deleted tetap ada di sini.
- Data yang belum valid tetap ada di sini.
- Data SPECIAL tetap ada di sini.

Field penting:

```text
tanggal
bulan
tahun_fiskal
kategori
sub_kategori
akun
nilai
keterangan
created_by
created_at
status_deleted
kode_perusahaan
nama_perusahaan
kode_bank
no_rekening
source_type
is_validated
validated_at
validator_notes
validator_notes_at
validator_notes_by
transaction_mode
is_special_transaction
attachments
posting_state
posting_version
posted_at
posting_error
```

### `tt_summary_v2`

Model:

```text
src/models/TtSummaryV2.ts
```

Fungsi:

- Summary baru untuk dashboard.
- Dibentuk dari `tt_finance_details`.
- Berisi periode DAILY, MONTHLY, YEARLY.

Struktur dokumen:

```text
period_type
period_start
tahun_fiskal
bulan_fiskal
bulan_fiskal_label
kategori
sub_kategori
akun
total_nilai
transaction_count
source
calculation_version
calculated_at
created_at
updated_at
```

Unique index:

```text
period_type
period_start
tahun_fiskal
kategori
sub_kategori
akun
```

Nama index:

```text
uniq_summary_v2_period_key
```

### Master Data

Collection master:

- `tm_kategori`
- `tm_sub_kategori`
- `tm_akun`
- `tm_perusahaan`
- `tm_bank`
- `tm_rekening`
- `tm_user`

Master data dipakai untuk:

- Dropdown frontend.
- Validasi import.
- Validasi relasi rekening-perusahaan.
- Referensi transaksi.

### Fiscal Config

Model:

```text
src/models/FiscalConfig.ts
```

Fungsi:

- Menyimpan active fiscal year.
- Menyimpan tahun fiskal yang sudah ditutup.

Field:

```text
key: 'fiscal'
active_year
closed_years[]
```

## Aturan Summary V2

Detail masuk `tt_summary_v2` hanya jika memenuhi semua rule:

```text
is_validated === true
status_deleted !== true
transaction_mode !== 'SPECIAL'
is_special_transaction !== true
```

Artinya:

- Transaksi belum valid tidak masuk dashboard.
- Transaksi soft deleted tidak masuk dashboard.
- Transaksi SPECIAL tidak masuk dashboard.
- Data tetap tersimpan di `tt_finance_details` untuk audit.

## Fiscal Year

Helper utama:

```text
src/services/summaryV2Service.ts
deriveTahunFiskalFromBulanV2()
parseFinanceBulan()
```

Aturan:

- JAN sampai NOV masuk tahun kalender yang sama.
- DEC masuk tahun fiskal berikutnya.

Contoh:

```text
JAN-26 -> tahun_fiskal 2026
DEC-24 -> tahun_fiskal 2025
```

## Posting State

Field di `tt_finance_details`:

```text
posting_state: 'NOT_APPLIED' | 'APPLIED' | 'FAILED'
posting_version: number
posted_at: Date | '-'
posting_error: string
```

Makna:

- `NOT_APPLIED`: detail belum/tidak masuk summary. Contoh: belum valid, deleted, SPECIAL.
- `APPLIED`: detail valid sudah ikut dibentuk ke `tt_summary_v2`.
- `FAILED`: disiapkan untuk status gagal di masa depan.

Saat ini flow utama:

- Transaksi baru: `NOT_APPLIED`.
- Import valid dan masuk summary: `APPLIED`.
- Validasi sukses dan summary sukses: `APPLIED`.
- Soft delete: balik `NOT_APPLIED`.
- Rebuild Summary Tool: menyamakan semua posting state.

## MongoDB Transaction

Flow kritis menggunakan MongoDB session/transaction:

- Import row valid.
- Validasi transaksi.
- Soft delete transaksi.
- Rebuild summary.

Tujuan:

- Kalau detail sudah berubah tetapi summary gagal, semua rollback.
- Kalau summary sudah dibuat tetapi commit gagal, semua rollback.
- Retry validasi tidak double posting.

Script pembuktian:

```bash
npm run test:mongo-transaction
```

Skenario test:

1. Gagal setelah detail save.
2. Gagal setelah summary rebuild.
3. Retry setelah gagal.
4. Validasi ulang transaksi yang sudah valid.

Ekspektasi:

- Tidak ada partial write.
- Saldo rekening rollback.
- Summary tidak double.
- `posting_state` benar.

## Alur Transaksi Baru

Endpoint:

```text
POST /api/transaksi
```

Alur:

1. Frontend mengirim transaksi.
2. Backend menentukan `tahun_fiskal` dari `bulan` jika tidak dikirim.
3. Backend cek fiscal year belum ditutup.
4. Backend menyimpan detail ke `tt_finance_details`.
5. Default `is_validated=false`.
6. Default `posting_state=NOT_APPLIED`.
7. Data belum masuk `tt_summary_v2`.

Transaksi baru baru masuk dashboard setelah divalidasi.

## Alur Validasi Transaksi

Endpoint:

```text
POST /api/transaksi/validate-attachment
```

Body:

```json
{
  "id": "ObjectId",
  "validator_notes": "catatan"
}
```

Alur:

1. Backend cek role `superuser` atau `corsec`.
2. Backend cek transaksi ada.
3. Backend cek fiscal year belum ditutup.
4. Kalau transaksi sudah valid:
   - Summary v2 direbuild ulang untuk key transaksi.
   - Posting state disync.
   - Tidak increment saldo lagi.
5. Kalau transaksi belum valid:
   - Saldo rekening diupdate jika bukan `FINANCE_ONLY`.
   - Detail diset `is_validated=true`.
   - Validator field diisi.
   - Summary v2 direbuild dari detail valid.
   - Posting state diset `APPLIED` jika masuk rule summary.
6. Semua terjadi dalam MongoDB transaction.

Penting:

- Summary v2 tidak memakai increment manual.
- Summary v2 dihitung ulang dari detail valid.
- Retry aman dari double posting summary.

## Jenis Transaksi

Field:

```text
transaction_mode
is_special_transaction
```

Nilai `transaction_mode`:

- `NORMAL`: transaksi biasa. Bisa memengaruhi rekening dan summary setelah valid.
- `SPECIAL`: transaksi khusus. Tidak masuk summary/dashboard.
- `FINANCE_ONLY`: transaksi finance-only. Tidak memengaruhi saldo rekening, tetapi tetap bisa masuk summary jika valid dan bukan special.

## Alur Soft Delete

Endpoint:

```text
DELETE /api/transaksi/:id
```

Alur:

1. Backend cek transaksi ada.
2. Backend cek fiscal year belum ditutup.
3. Jika transaksi sudah valid:
   - Hanya superuser yang boleh.
   - Wajib `DELETE_VALIDATED_SECRET_CODE`.
4. Saldo rekening di-rollback jika transaksi valid dan memengaruhi rekening.
5. `status_deleted=true`.
6. `deleted_at` dan `deleted_by` diisi.
7. Summary v2 direbuild.
8. Posting state menjadi `NOT_APPLIED`.

Data tidak dihapus fisik dari database.

## Alur Import `tt_finance_details`

Endpoint:

```text
POST /api/transaksi/import-details
POST /api/transaksi/import-details/batch
```

Tujuan:

- Mengimpor data export dari sistem lama ke `tt_finance_details`.
- Membentuk `tt_summary_v2` untuk data yang valid.

Format:

- JSON
- CSV

Validasi wajib:

- `tanggal`
- `bulan`
- `kategori`
- `sub_kategori`
- `akun`
- `nilai`

Validasi master:

- Kategori harus ada dan aktif.
- Sub kategori harus ada dan aktif.
- Akun harus ada dan aktif untuk sub kategori.
- Kode perusahaan harus ada di master perusahaan.
- Kode bank harus ada di master bank.
- Nomor rekening harus ada di master rekening.
- Rekening harus terhubung ke perusahaan.

Ketentuan deleted:

- Row `status_deleted=true` boleh tetap masuk ke `tt_finance_details`.
- Row deleted tidak masuk `tt_summary_v2`.

Ketentuan duplicate:

- Jika dokumen dengan `_id` yang sama sudah ada, import akan skip.
- Skip ditampilkan di report import.

Report import:

```text
total
success
skipped
failed
summary_rebuilt
errors[]
successes[]
skips[]
```

## Summary Rebuild

Endpoint:

```text
POST /api/summary-v2/rebuild
```

Role:

```text
superuser
```

Alur:

1. Ambil semua detail valid sesuai rule summary.
2. Bangun key DAILY, MONTHLY, YEARLY.
3. Hapus isi `tt_summary_v2`.
4. Insert ulang summary hasil kalkulasi.
5. Set posting state detail valid menjadi `APPLIED`.
6. Set posting state detail non-summary menjadi `NOT_APPLIED`.
7. Semua berjalan dalam MongoDB transaction.

Response data:

```text
source_detail_count
summary_before_count
summary_after_count
daily_count
monthly_count
yearly_count
skipped_invalid_key
posting_applied_count
posting_not_applied_count
rebuilt_at
```

## Reconciliation

Endpoint:

```text
GET /api/summary-v2/reconciliation?limit=1000
GET /api/summary-v2/reconciliation?include_matches=true&limit=1000
```

Role:

```text
superuser
```

Fungsi:

- Menghitung expected summary dari `tt_finance_details`.
- Membandingkan dengan actual `tt_summary_v2`.
- Menghasilkan daftar mismatch.

Status:

- `MATCH`
- `MISSING_SUMMARY`
- `SUMMARY_GREATER_THAN_DETAIL`
- `DETAIL_GREATER_THAN_SUMMARY`
- `DUPLICATE_SUMMARY`

Makna:

- `MATCH`: detail dan summary sama.
- `MISSING_SUMMARY`: detail valid ada, summary belum ada.
- `SUMMARY_GREATER_THAN_DETAIL`: summary lebih besar dari detail.
- `DETAIL_GREATER_THAN_SUMMARY`: detail lebih besar dari summary.
- `DUPLICATE_SUMMARY`: ada lebih dari satu summary untuk key yang sama.

## Dashboard API

### `GET /api/dashboard/rekap-aggregate`

Query:

```text
tahun=2026
bulan=JAN
```

Sumber:

```text
tt_summary_v2 period_type=MONTHLY
```

Response utama:

```text
source: 'tt_summary_v2'
rekap
data
pertahun
biayaBiaya
biaya_biaya
```

### `GET /api/dashboard/pendapatan-harian`

Query:

```text
tahun=2026
bulan=JAN
```

Sumber:

```text
tt_summary_v2 period_type=DAILY
```

Dipakai untuk grafik harian/trend.

## Fiscal API

### `GET /api/fiscal/years`

Mengambil daftar tahun dari:

- `tt_finance_details`
- `tt_summary_v2`
- `FiscalConfig.closed_years`
- `FiscalConfig.active_year`

### `GET /api/fiscal/months?tahun=2026`

Mengambil daftar bulan fiskal untuk tahun tertentu.

### `GET /api/fiscal/active`

Mengambil fiscal year aktif.

Jika belum ada config, backend infer dari data detail/summary.

### `POST /api/fiscal/close`

Role:

```text
superuser atau corsec
```

Body:

```json
{
  "fiscalYear": 2026
}
```

Fungsi:

- Mengunci fiscal year.
- Menambahkan ke `closed_years`.
- Mengubah `active_year` ke tahun berikutnya.

Setelah ditutup, transaksi pada tahun tersebut tidak bisa diinput/edit/delete/validasi.

## Auth API

Prefix:

```text
/api/auth
```

Endpoint:

| Method | Path | Fungsi |
| --- | --- | --- |
| POST | `/register` | Register user password |
| POST | `/login` | Login user password |
| POST | `/register-challenge` | Generate WebAuthn register challenge |
| POST | `/register-verify` | Verify WebAuthn register response |
| POST | `/login-challenge` | Generate WebAuthn login challenge |
| POST | `/login-verify` | Verify WebAuthn login response |

## Master API

Prefix:

```text
/api/master
```

### Kategori

| Method | Path | Auth | Fungsi |
| --- | --- | --- | --- |
| GET | `/kategori` | Tidak wajib | List kategori aktif |
| GET | `/kategori?all=true` | Tidak wajib | List semua kategori |
| POST | `/kategori` | Ya | Tambah kategori |
| PUT | `/kategori/:id` | Ya | Update/reactivate kategori |
| DELETE | `/kategori/:id` | Ya | Soft delete kategori |

### Sub Kategori

| Method | Path | Auth | Fungsi |
| --- | --- | --- | --- |
| GET | `/subkategori` | Tidak wajib | List sub kategori aktif |
| GET | `/subkategori?kategori=BIAYA` | Tidak wajib | Filter kategori |
| POST | `/subkategori` | Ya | Tambah sub kategori |
| PUT | `/subkategori/:id` | Ya | Update/reactivate sub kategori |
| DELETE | `/subkategori/:id` | Ya | Soft delete sub kategori |

### Akun

| Method | Path | Auth | Fungsi |
| --- | --- | --- | --- |
| GET | `/akun` | Tidak wajib | List akun aktif |
| POST | `/akun` | Ya | Tambah akun |
| PUT | `/akun/:id` | Ya | Update/reactivate akun |
| DELETE | `/akun/:id` | Ya | Soft delete akun |

### Perusahaan

| Method | Path | Auth | Fungsi |
| --- | --- | --- | --- |
| GET | `/perusahaan` | Tidak wajib | List perusahaan |
| POST | `/perusahaan` | Tidak wajib saat ini | Tambah perusahaan |
| PUT | `/perusahaan/:id` | Tidak wajib saat ini | Update perusahaan |
| DELETE | `/perusahaan/:id` | Tidak wajib saat ini | Delete perusahaan |

### Bank

| Method | Path | Auth | Fungsi |
| --- | --- | --- | --- |
| GET | `/bank` | Tidak wajib | List bank |
| GET | `/bank/:id` | Tidak wajib | Detail bank |
| POST | `/bank` | Tidak wajib saat ini | Tambah bank |
| PUT | `/bank/:id` | Tidak wajib saat ini | Update bank |
| DELETE | `/bank/:id` | Tidak wajib saat ini | Delete bank |

### Rekening

| Method | Path | Auth | Fungsi |
| --- | --- | --- | --- |
| GET | `/rekening` | Tidak wajib | List rekening |
| GET | `/rekening/:id` | Tidak wajib | Detail rekening |
| POST | `/rekening` | Ya | Tambah rekening |
| PUT | `/rekening/:id` | Ya | Update rekening |
| DELETE | `/rekening/:id` | Ya | Delete rekening |
| POST | `/rekening/transfer-saldo` | Ya | Transfer saldo antar rekening |

Catatan maintenance:

- Beberapa route master write masih belum memakai auth di route file tertentu. Jika masuk production, sebaiknya semua write master diproteksi.

## Transaksi API

Prefix:

```text
/api/transaksi
```

| Method | Path | Auth | Fungsi |
| --- | --- | --- | --- |
| GET | `/tt-finance-detail` | Tidak wajib saat ini | List detail transaksi dari `tt_finance_details` |
| GET | `/` | Tidak wajib saat ini | List transaksi/summary legacy-compatible |
| POST | `/` | Tidak wajib saat ini | Tambah transaksi detail |
| POST | `/batch` | Tidak wajib saat ini | Batch insert transaksi |
| PUT | `/:id` | Tidak wajib saat ini | Edit transaksi belum valid |
| DELETE | `/:id` | Ya | Soft delete transaksi |
| POST | `/:id/attachments` | Tidak wajib saat ini | Upload attachment |
| DELETE | `/:id/attachments/:filename` | Ya | Delete attachment |
| POST | `/validate-attachment` | Ya | Validasi transaksi |
| PUT | `/validator-notes` | Ya | Update validator notes |
| GET | `/export-excel` | Tidak wajib saat ini | Export Excel |
| POST | `/import-details` | Ya | Import file JSON/CSV |
| POST | `/import-details/batch` | Ya | Import batch dari frontend |
| GET | `/saldo-rekening` | Tidak wajib saat ini | Ambil saldo rekening |

Query list transaksi/detail umum:

```text
tahun
bulan
kategori
sub_kategori
akun
input_by
page
limit
flatten
sortKategori
q
special_type
```

## Users API

Prefix:

```text
/api/users
```

Semua endpoint wajib auth.

| Method | Path | Fungsi |
| --- | --- | --- |
| GET | `/` | List user |
| POST | `/` | Create user |
| PUT | `/change-password` | User ganti password sendiri |
| PUT | `/:id` | Update user |
| DELETE | `/:id` | Delete user |

## Upload File

Route static:

```text
/uploads
```

Folder runtime:

```text
uploads/transaksi/
```

Upload transaksi:

```text
POST /api/transaksi/:id/attachments
field: attachments[]
```

File disimpan di backend dan path disimpan di `tt_finance_details.attachments`.

Contoh path:

```text
/uploads/transaksi/attachments-123456.jpg
```

Frontend membuka file dengan:

```text
VITE_API_BASE_URL_ATTACHMENT + path
```

## Index Database

Summary v2 wajib memiliki unique index.

Jalankan:

```bash
npm run ensure-summary-index
```

Atau untuk sync index model:

```bash
npm run sync-indexes
```

Index penting `tt_summary_v2`:

```text
period_type
period_start
tahun_fiskal
kategori
sub_kategori
akun
```

Tanpa index ini, risiko duplicate summary lebih besar.

## Data Lama yang Tidak Lagi Jadi Sumber Utama

Collection lama masih mungkin ada di database atau model:

- `tt_finance`
- `tt_finance_daily`
- `th_finance`
- `th_finance_daily`

Untuk finance v2:

- Dashboard membaca `tt_summary_v2`.
- Summary dibentuk dari `tt_finance_details`.
- Collection lama tidak dipakai sebagai source of truth.

## Checklist Saat Deploy

1. Pastikan `.env` backend benar.
2. Pastikan `.env` frontend benar.
3. Jalankan build backend.
4. Jalankan build frontend.
5. Pastikan MongoDB support transaction. Pada Atlas/replica set normalnya support.
6. Jalankan `npm run ensure-summary-index`.
7. Jalankan Rebuild Summary Tool jika data baru/import sudah siap.
8. Jalankan Reconciliation Tool.
9. Pastikan mismatch = 0 atau mismatch yang tersisa sudah dijelaskan.
10. Pastikan folder `uploads/` ada dan writable oleh process backend.

## Checklist Saat Menambah Fitur

- Jika fitur mengubah transaksi, tentukan apakah memengaruhi:
  - `tt_finance_details`
  - `tt_summary_v2`
  - `tm_rekening.saldo`
- Gunakan MongoDB transaction untuk flow multi-write.
- Jangan update summary dengan increment manual.
- Rebuild summary berdasarkan detail valid.
- Update `posting_state` jika detail masuk/keluar summary.
- Cek fiscal year closed sebelum edit/delete/validasi.
- Tambahkan endpoint ke README ini.
- Tambahkan validasi master jika data import/input tergantung master.

## Known Technical Notes

- `tt_finance_details` adalah sumber kebenaran transaksi.
- `tt_summary_v2` adalah read model untuk dashboard.
- Soft delete memakai `status_deleted`.
- Transaksi deleted tetap tersimpan di detail, tetapi tidak masuk summary.
- SPECIAL tetap tersimpan di detail, tetapi tidak masuk summary.
- Summary rebuild bersifat destructive terhadap `tt_summary_v2`, lalu dibangun ulang dari detail valid.
- Beberapa endpoint master/transaksi write masih public pada route file tertentu. Untuk hardening production, proteksi auth perlu diratakan.

