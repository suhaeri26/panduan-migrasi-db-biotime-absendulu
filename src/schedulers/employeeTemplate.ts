import cron from 'node-cron';
import { pgPool, pgPool2 } from '../db';

/* ======================================================
 * Device Cache (optional, deviceId boleh NULL)
 * ====================================================== */
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
    if (r.deviceSn) {
      deviceCache.set(r.deviceSn.trim(), r.deviceId);
    }
  }

  console.log(`✅ Device cache loaded (${deviceCache.size} devices)`);
};

export const getDeviceIdBySn = (sn: string): number | null => {
  return deviceCache.get(sn?.trim()) ?? null;
};

/* ======================================================
 * In-memory helpers
 * ====================================================== */
const dedupCache = new Set<string>(); // dedup cepat
let isRunning = false;

/* ======================================================
 * Helper update issend
 * ====================================================== */
const markAsSent = async (ids: number[]) => {
  if (!ids.length) return;

  await pgPool.query(`
    UPDATE iclock_biodata
    SET "issend" = true
    WHERE id = ANY($1)
  `, [ids]);
};

/* ======================================================
 * CRON SYNC — FINAL
 * ====================================================== */
export const startDeviceEmployeeTemplateSync = () => {

  const job = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      /* ==================================================
       * 1️⃣ Ambil data dari BioTime
       * ================================================== */
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
        ORDER BY ib.id
        LIMIT 250;
      `);

      if (!sourceRows.length) {
        console.log('[CRON] no data');
        return;
      }

      /* ==================================================
       * 2️⃣ Pre-filter + memory dedup
       * ================================================== */
      const candidates: any[] = [];
      const dedupTuples: any[] = [];

      const insertIds: number[] = [];
      const duplicateIds: number[] = [];

      for (const r of sourceRows) {
        const dedupKey = `${r.index}|${r.fid}|${r.templateType}|${r.majorver}`;

        // ♻️ duplikat memory
        if (dedupCache.has(dedupKey)) {
          duplicateIds.push(r.id);
          continue;
        }

        candidates.push({
          ...r,
          deviceId: getDeviceIdBySn(r.deviceSn), // 👈 BOLEH NULL
          dedupKey
        });

        dedupTuples.push(
          r.index,
          r.fid,
          r.templateType,
          r.majorver
        );
      }

      // kalau semua memory-duplicate
      if (!candidates.length && duplicateIds.length) {
        await markAsSent(duplicateIds);
        console.log('[CRON] all duplicate (memory)');
        return;
      }

      if (!candidates.length) return;

      /* ==================================================
       * 3️⃣ Dedup ke DB tujuan (JOIN VALUES)
       * ================================================== */
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

      /* ==================================================
       * 4️⃣ Build payload INSERT
       * ================================================== */
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
          deviceId: r.deviceId, // 🔥 NULL OK
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

      /* ==================================================
       * 5️⃣ Bulk insert
       * ================================================== */
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

      /* ==================================================
       * 6️⃣ Update issend (INSERT + DUPLIKAT)
       * ================================================== */
      const doneIds = [...insertIds, ...duplicateIds];
      await markAsSent(doneIds);

      console.log(
        `🚀 SYNC DONE | inserted=${insertIds.length} | duplicate=${duplicateIds.length}`
      );

    } catch (err: any) {
      console.error('❌ Sync error:', err.message || err);
    } finally {
      isRunning = false;
    }
  };

  // 🔥 langsung jalan saat start
  job();

  // 🔁 jalan periodik
  cron.schedule('*/3 * * * * *', job);
};
