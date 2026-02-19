import cron from 'node-cron';
import { pgPool, pgPool2 } from '../db';

/* ===============================
 * Device Cache
 * =============================== */
let deviceCache = new Map<string, number>();

export const loadDeviceCache = async () => {
  const { rows } = await pgPool2.query(`
    SELECT
      "deviceId",
      "deviceSN" AS "deviceSn"
    FROM "devices"
  `);

  deviceCache.clear();
  for (const r of rows) {
    deviceCache.set(r.deviceSn.trim(), r.deviceId);
  }

  console.log(`✅ Device cache loaded (${deviceCache.size} devices)`);
};

export const getDeviceIdBySn = (sn: string): number | undefined => {
  return deviceCache.get(sn.trim());
};

/* ===============================
 * In-Memory Helpers
 * =============================== */
const ignoredDeviceSn = new Set<string>();   // device tidak ada
const dedupCache = new Set<string>();        // dedup cepat
let isRunning = false;

/* ===============================
 * Helper: build NOT IN clause
 * =============================== */
const buildIgnoreSnClause = (ignored: Set<string>) => {
  if (!ignored.size) return { clause: '', params: [] as string[] };

  const params = [...ignored];
  const placeholders = params.map((_, i) => `$${i + 1}`).join(',');

  return {
    clause: `AND ib.sn NOT IN (${placeholders})`,
    params
  };
};

/* ===============================
 * Cron Sync (FINAL)
 * =============================== */
export const startDeviceEmployeeTemplateSync = () => {
  const job = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      /* =====================================================
       * 1️⃣ Ambil data BioTime
       * ===================================================== */
      const { clause, params } = buildIgnoreSnClause(ignoredDeviceSn);

      const { rows: sourceRows } = await pgPool.query(`
        SELECT 
            ib.id            AS "id",
            e.emp_code       AS "employeeId",
            ib.sn            AS "deviceSn",
            ib.bio_type      AS "templateType",
            ib.bio_no        AS "fid",
            ib.bio_index     AS "index",
            ib.major_ver     AS "majorver",
            ib.minor_ver     AS "minorver",
            ib.bio_format    AS "format",
            ib.bio_tmp       AS "data"
        FROM iclock_biodata ib 
        LEFT JOIN personnel_employee e
          ON ib.employee_id = e.id
        WHERE ib."issend" = false
        ${clause}
        LIMIT 250;
      `, params);

      if (!sourceRows.length) {
        console.log('[CRON] no data');
        return;
      }

      /* =====================================================
       * 2️⃣ Pre-filter + klasifikasi
       * ===================================================== */
      const candidates: any[] = [];
      const dedupTuples: any[] = [];

      const insertIds: number[] = [];
      const duplicateIds: number[] = [];

      for (const r of sourceRows) {
        const deviceId = getDeviceIdBySn(r.deviceSn);

        // ❌ device tidak ada → skip permanen
        if (!deviceId) {
          ignoredDeviceSn.add(r.deviceSn);
          continue;
        }

        const key = `${r.index}|${r.fid}|${r.templateType}|${r.majorver}`;

        // ♻️ sudah pernah diproses di memory
        if (dedupCache.has(key)) {
          duplicateIds.push(r.id);
          continue;
        }

        dedupTuples.push(r.index, r.fid, r.templateType, r.majorver);
        candidates.push({ ...r, deviceId, dedupKey: key });
      }

      if (!candidates.length && duplicateIds.length) {
        await markAsSent(duplicateIds);
        console.log(`[CRON] all duplicate (memory)`);
        return;
      }

      if (!candidates.length) return;

      /* =====================================================
       * 3️⃣ Dedup ke DB tujuan (JOIN VALUES)
       * ===================================================== */
      const valuesSql = candidates.map((_, i) => {
        const b = i * 4;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`;
      }).join(',');

      const { rows: existingRows } = await pgPool2.query(`
        SELECT t."index", t."fid", t."templateType", t."majorver"
        FROM "deviceemployeetemplates" t
        JOIN (VALUES ${valuesSql})
          AS v("index","fid","templateType","majorver")
          ON t."index" = v."index"
         AND t."fid" = v."fid"
         AND t."templateType" = v."templateType"
         AND t."majorver" = v."majorver"
      `, dedupTuples);

      const dbDupSet = new Set(
        existingRows.map(r =>
          `${r.index}|${r.fid}|${r.templateType}|${r.majorver}`
        )
      );

      /* =====================================================
       * 4️⃣ Build payload
       * ===================================================== */
      const now = new Date();
      const payload: any[] = [];

      for (const r of candidates) {
        if (dbDupSet.has(r.dedupKey)) {
          duplicateIds.push(r.id);
          dedupCache.add(r.dedupKey);
          continue;
        }

        payload.push({
          employeeId: r.employeeId,
          deviceId: r.deviceId,
          index: r.index,
          fid: r.fid,
          templateType: r.templateType,
          majorver: r.majorver,
          minorver: r.minorver,
          format: r.format,
          size: r.data.length,
          data: r.data,
          createdAt: now,
          updatedAt: now
        });

        insertIds.push(r.id);
        dedupCache.add(r.dedupKey);
      }

      /* =====================================================
       * 5️⃣ Insert data baru
       * ===================================================== */
      if (payload.length) {
        const values = payload.map((_, i) => {
          const b = i * 12;
          return `(
            $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4},
            $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8},
            $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12}
          )`;
        }).join(',');

        await pgPool2.query(`
          INSERT INTO "deviceemployeetemplates"
          (
            "employeeId",
            "deviceId",
            "index",
            "fid",
            "templateType",
            "majorver",
            "minorver",
            "format",
            "size",
            "data",
            "createdAt",
            "updatedAt"
          )
          VALUES ${values}
        `, payload.flatMap(p => Object.values(p)));
      }

      /* =====================================================
       * 6️⃣ UPDATE issend (BARU + DUPLIKAT)
       * ===================================================== */
      const doneIds = [...insertIds, ...duplicateIds];

      if (doneIds.length) {
        await markAsSent(doneIds);
      }

      console.log(
        `🚀 FAST SYNC | inserted=${insertIds.length} | duplicate=${duplicateIds.length} | ignoredSN=${ignoredDeviceSn.size}`
      );

    } catch (err: any) {
      console.error('❌ Sync error:', err.message || err);
    } finally {
      isRunning = false;
    }
  };

  // 🔥 langsung jalan sekali
  job();

  // 🔁 lalu periodik
  cron.schedule('*/3 * * * * *', job);
};

/* ===============================
 * Helper update issend
 * =============================== */
const markAsSent = async (ids: number[]) => {
  await pgPool.query(`
    UPDATE iclock_biodata
    SET "issend" = true
    WHERE id = ANY($1)
  `, [ids]);
};
