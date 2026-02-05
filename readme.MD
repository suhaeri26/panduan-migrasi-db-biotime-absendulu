# 📌 Sinkronisasi Data Absensi (Biotime ↔ AbsenDulu)

Dokumen ini menjelaskan **langkah teknis lengkap** untuk melakukan sinkronisasi data absensi dari **database Biotime (lama)** ke **database AbsenDulu (baru)** menggunakan **PostgreSQL FDW**, dengan mekanisme **flag `issend`** dan **batch processing** yang aman.

---

## 🧩 Gambaran Umum Alur

1. Menambahkan kolom `issend` sebagai penanda data sudah terkirim
2. Membuat index agar pencarian data lebih cepat
3. Menghubungkan database lama menggunakan **postgres_fdw**
4. Melakukan mirror table yang dibutuhkan
5. Memindahkan data absensi secara batch
6. Menandai data yang sudah diproses
7. Membersihkan FDW setelah selesai

---

## 1️⃣ Menambahkan Kolom `issend`
Kolom ini digunakan untuk menandai apakah data sudah dikirim atau belum.

### 📋 Tabel `personnel_employee`
```sql
ALTER TABLE personnel_employee
ADD COLUMN issend BOOLEAN DEFAULT FALSE;
```

### 📋 Tabel `iclock_transaction`
```sql
ALTER TABLE iclock_transaction
ADD COLUMN issend BOOLEAN DEFAULT FALSE;
```

---

## 2️⃣ Membuat Index untuk Optimasi Query
Karena data dengan `issend = false` akan sering dicari, maka dibuat **partial index**.

```sql
CREATE INDEX idx_iclock_issend_false
ON iclock_transaction (issend)
WHERE issend = false;
```

📈 *Index ini membuat proses batch jauh lebih cepat dan efisien.*

---

## 3️⃣ Cek Konfigurasi Login Database
Untuk memastikan apakah database memerlukan autentikasi tambahan:

```sql
SHOW hba_file;
```

---

## 4️⃣ Menghubungkan Database Lama dengan FDW
Digunakan agar **AbsenDulu** dapat membaca data langsung dari **Biotime**.

### 🔌 Membuat Server FDW
```sql
CREATE SERVER old_absen_db
FOREIGN DATA WRAPPER postgres_fdw
OPTIONS (
  host 'localhost',
  dbname 'bakrie_new',
  port '5432'
);
```

---

## 5️⃣ Mapping User ke Database Lama

```sql
CREATE USER MAPPING FOR CURRENT_USER
SERVER old_absen_db
OPTIONS (
  user 'postgres',
  password 'Suhaeri_2610'
);
```

⚠️ **Catatan:**
Disarankan menggunakan user khusus dengan privilege terbatas untuk production.

---

## 6️⃣ Mirror (Import) Table yang Dibutuhkan

```sql
IMPORT FOREIGN SCHEMA public
LIMIT TO (
  iclock_transaction,
  personnel_employee
)
FROM SERVER old_absen_db
INTO public;
```

📂 Table ini bersifat **read-only mirror** dari database lama.

---

## 7️⃣ Proses Pemindahan Data Absensi
Data akan diproses **per batch (1000 data)** menggunakan mekanisme locking agar aman untuk multi-worker.

```sql
BEGIN;

WITH moved AS (
  SELECT
    t.id,
    t.terminal_sn,
    t.terminal_id,
    t.emp_code,
    t.punch_time,
    t.punch_state,
    t.verify_type,
    t.work_code,
    t.is_mask,
    t.temperature
  FROM iclock_transaction t
  JOIN personnel_employee e ON t.emp_code = e.emp_code
  WHERE t.issend = false
  ORDER BY t.id
  LIMIT 1000
  FOR UPDATE SKIP LOCKED
)
INSERT INTO deviceattendances (
  "deviceSn",
  "deviceId",
  "pin",
  "atttime",
  "attstatus",
  "verify",
  "workCode",
  "maskflag",
  "temperature",
  "createdAt",
  "updatedAt"
)
SELECT
  terminal_sn,
  terminal_id,
  emp_code,
  punch_time,
  punch_state::int,
  verify_type,
  work_code,
  is_mask,
  COALESCE(temperature::numeric, 0),
  NOW(),
  NOW()
FROM moved;

UPDATE iclock_transaction
SET issend = true
WHERE id IN (SELECT id FROM moved);

COMMIT;
```

✅ Aman untuk:
- Cron job
- Worker paralel
- Data besar

---

## 8️⃣ Menghapus Mirror Table
Jika proses sinkronisasi sudah selesai:

```sql
DROP FOREIGN TABLE iclock_transaction;
DROP FOREIGN TABLE personnel_employee;
```

---

## 9️⃣ Menghapus Koneksi FDW

```sql
DROP SERVER old_absen_db CASCADE;
```

---

## 🔟 Menonaktifkan FDW (Opsional)
Jika FDW sudah tidak dibutuhkan sama sekali:

```sql
DROP EXTENSION postgres_fdw;
```

---

## 🎯 Catatan Akhir
- Gunakan **batch kecil** untuk menghindari beban berat
- Selalu gunakan **transaction**
- Monitor index dan ukuran tabel
- Cocok untuk integrasi **Biotime → Sistem Absensi Custom**

---

✨ *Semangatsssssssssssssssssssssssssssssssssssssssssssssssssss*

