import cron from 'node-cron';
import { pgPool, pgPool2 } from '../db';

/* ===============================
 * Device Cache (camelCase schema)
 * =============================== */
let deviceCache = new Map<string, number>();
let lastLoadedAt: number | null = null;

export const loadDeviceCache = async () => {
  const { rows } = await pgPool2.query(`
    SELECT
      "deviceId",
      "deviceSN" AS "deviceSn"
    FROM "devices"
  `);
    console.log(rows.map(r => [r.deviceSn, r.deviceId]))
  deviceCache = new Map(
    rows.map(r => [r.deviceSn, r.deviceId])
  );

  lastLoadedAt = Date.now();
  console.log(`✅ Device cache loaded (${deviceCache.size} devices)`);
};

export const getDeviceIdBySn = (sn: string): number | undefined => {
  return deviceCache.get(sn);
};

export const getDeviceCacheInfo = () => ({
  size: deviceCache.size,
  lastLoadedAt
});

/* ===============================
 * Cron Lock (anti overlap)
 * =============================== */
let isRunning = false;

/* ===============================
 * Cron Sync
 * =============================== */
export const startDeviceEmployeeTemplateSync = () => {
  // jalan tiap 3 detik
  cron.schedule('*/3 * * * * *', async () => {
    if (isRunning) return;
    isRunning = true;

    console.log('__________ Memulai Device Template Sync __________');

    try {
      /* =====================================================
       * 1️⃣ Ambil data template dari BioTime (snake_case)
       * ===================================================== */
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
        LIMIT 250;
      `);

      if (!sourceRows.length) {
        console.log('✅ Tidak ada template baru');
        return;
      }

      /* =====================================================
       * 2️⃣ Dedup check (camelCase + "index")
       * ===================================================== */
      const dedupParams: any[] = [];
      const dedupValues = sourceRows
        .map((r, i) => {
          const base = i * 4;
          dedupParams.push(
            r.index,
            r.fid,
            r.templateType,
            r.majorver
          );
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
        })
        .join(',');

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
       * 3️⃣ Filter + mapping payload
       * ===================================================== */
      const payload = sourceRows
        .filter(r => {
          const key = `${r.index}|${r.fid}|${r.templateType}|${r.majorver}`;
          return !existingSet.has(key);
        })
        .map(r => {
          const deviceId = getDeviceIdBySn(r.deviceSn);
          if (!deviceId) {
            throw new Error(`❌ Device SN ${r.deviceSn} tidak ada di cache`);
          }

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
            data: r.data
          };
        });

      /* =====================================================
       * 4️⃣ Bulk insert (camelCase + "index")
       * ===================================================== */
      if (payload.length) {
        const values = payload
          .map((_, i) => {
            const b = i * 10;
            return `(
              $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5},
              $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}
            )`;
          })
          .join(',');

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
            "data"
          )
          VALUES ${values}
        `, payload.flatMap(p => Object.values(p)));

        console.log(`✅ Inserted ${payload.length} template`);
      } else {
        console.log('ℹ️ Semua template sudah ada (duplicate)');
      }

      /* =====================================================
       * 5️⃣ Update issend di BioTime
       * ===================================================== */
      await pgPool.query(`
        UPDATE iclock_biodata
        SET "issend" = true
        WHERE id = ANY($1)
      `, [sourceRows.map(r => r.id)]);

      console.log(`🎉 Sync selesai (${sourceRows.length} data diproses)`);

    } catch (err: any) {
      console.error('❌ Sync error:', err.message || err);
    } finally {
      isRunning = false;
    }
  });
};
