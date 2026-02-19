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

  deviceCache = new Map(
    rows.map(r => [r.deviceSn.trim(), r.deviceId])
  );

  console.log(`✅ Device cache loaded (${deviceCache.size} devices)`);
};

export const getDeviceIdBySn = (sn: string): number | undefined => {
  return deviceCache.get(sn.trim());
};

/* ===============================
 * Ignore SN (IN-MEMORY)
 * =============================== */
const ignoredDeviceSn = new Set<string>();

/* ===============================
 * Cron Lock
 * =============================== */
let isRunning = false;

/* ===============================
 * Helper: build NOT IN clause
 * =============================== */
const buildIgnoreSnClause = (ignored: Set<string>) => {
  if (!ignored.size) {
    return { clause: '', params: [] as string[] };
  }

  const params = [...ignored];
  const placeholders = params.map((_, i) => `$${i + 1}`).join(',');

  return {
    clause: `AND ib.sn NOT IN (${placeholders})`,
    params
  };
};

/* ===============================
 * Cron Sync
 * =============================== */
export const startDeviceEmployeeTemplateSync = () => {
  cron.schedule('*/3 * * * * *', async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      /* =====================================================
       * 1️⃣ Query BioTime (EXCLUDE ignored SN)
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

      if (!sourceRows.length) return;

      /* =====================================================
       * 2️⃣ Dedup check (DB tujuan)
       * ===================================================== */
      const dedupParams: any[] = [];
      const dedupValues = sourceRows.map((r, i) => {
        const b = i * 4;
        dedupParams.push(
          r.index,
          r.fid,
          r.templateType,
          r.majorver
        );
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`;
      }).join(',');

      const { rows: existingRows } = await pgPool2.query(`
        SELECT
          "index",
          "fid",
          "templateType",
          "majorver"
        FROM "deviceemployeetemplates"
        WHERE ("index", "fid", "templateType", "majorver")
        IN (${dedupValues})
      `, dedupParams);

      const existingSet = new Set(
        existingRows.map(r =>
          `${r.index}|${r.fid}|${r.templateType}|${r.majorver}`
        )
      );

      /* =====================================================
       * 3️⃣ Build payload
       * - device tidak ada → MASUK IGNORE LIST
       * ===================================================== */
      const now = new Date();

      const payload = sourceRows
        .map(r => {
          const deviceId = getDeviceIdBySn(r.deviceSn);

          // 🚫 DEVICE TIDAK ADA → IGNORE UNTUK CRON BERIKUTNYA
          if (!deviceId) {
            console.warn(`⚠️ Device ${r.deviceSn} di-ignore`);
            ignoredDeviceSn.add(r.deviceSn);
            return null;
          }

          const key = `${r.index}|${r.fid}|${r.templateType}|${r.majorver}`;
          if (existingSet.has(key)) return null;

          return {
            employeeId: r.employeeId,
            deviceId,
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
          };
        })
        .filter(Boolean) as any[];

      /* =====================================================
       * 4️⃣ Insert ke DB tujuan
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

      console.log(
        `✅ Sync OK | inserted=${payload.length}, ignoredSN=${ignoredDeviceSn.size}`
      );

    } catch (err: any) {
      console.error('❌ Sync error:', err.message || err);
    } finally {
      isRunning = false;
    }
  });
};
