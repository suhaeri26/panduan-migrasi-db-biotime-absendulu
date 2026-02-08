import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

/* ======================
   DATABASE CONNECTION
====================== */

const sourcePool = new Pool({
  host: "localhost",
  port: 5432,
  database: "last_backup",
  user: "postgres",
  password: "BSP_AMI_2025",
});

const targetPool = new Pool({
  host: "localhost",
  port: 5432,
  database: "presensi",
  user: "postgres",
  password: "BSP_AMI_2025",
});

const BATCH = 2000;

/* ======================
   PROCESS PER DEVICE
====================== */

async function processDevice() {
  console.log(`🔧 Worker start`);

  while (true) {
    /* 1️⃣ Ambil data source */
    const { rows } = await sourcePool.query(
      `
      SELECT 
        t.id,
        t.terminal_sn     AS "deviceSn",
        t.terminal_alias AS "deviceName",
        t.area_alias     AS "areaName",
        t.terminal_id    AS "deviceId",
        t.emp_code       AS pin,
        t.punch_time     AS "atttime",
        t.punch_state    AS "attstatus",
        t.verify_type    AS "verify",
        t.work_code      AS "workCode",
        t.is_mask        AS "maskflag",
        t.temperature
      FROM iclock_transaction t
      WHERE upload_time > '2026-02-07 12:30:00' AND t.issend = false
      ORDER BY t.id
      LIMIT $1
      `,
      [BATCH]
    );

    if (rows.length === 0) {
      console.log(`✅ Worker  finished`);
      break;
    }

    /* 2️⃣ INSERT ke target (AMAN, idempotent) */
    const insertQuery = `
      INSERT INTO deviceattendances (
        "deviceSn","deviceId","pin","atttime","attstatus",
        "verify","workCode","maskflag","temperature",
        "deviceName","areaName","createdAt","updatedAt"
      )
      VALUES ${rows
        .map(
          (_, i) =>
            `($${i * 11 + 1},$${i * 11 + 2},$${i * 11 + 3},$${i * 11 + 4},
              $${i * 11 + 5},$${i * 11 + 6},$${i * 11 + 7},$${i * 11 + 8},
              $${i * 11 + 9},$${i * 11 + 10},$${i * 11 + 11},NOW(),NOW())`
        )
        .join(",")}
        ON CONFLICT ("pin","atttime") DO NOTHING
        RETURNING "pin","atttime";
        `;

    const insertValues = rows.flatMap((r) => [
      r.deviceSn,
      r.deviceId,
      r.pin,
      r.atttime,
      Number(r.attstatus),
      r.verify,
      r.workCode || null,
      r.maskflag,
      r.temperature ?? 0,
      r.deviceName,
      r.areaName,
    ]);

    const insertResult = await targetPool.query(
      insertQuery,
      insertValues
    );

    /* 3️⃣ Tandai source HANYA jika berhasil masuk */
    // if (insertResult.rowCount > 0) {
      const idsToUpdate = rows.map((r) => r.id);

      await sourcePool.query(
        `
        UPDATE iclock_transaction
        SET issend = true
        WHERE id = ANY($1)
        `,
        [idsToUpdate]
      );
    // }

    console.log(
      `➡️  inserted ${insertResult.rowCount}/${rows.length}`
    );
  }
}

/* ======================
   WORKER
====================== */
(async () => {
  try {
    console.log("🚀 Attendance migration started");

    // await Promise.all([
    //   worker(1, devices1),
    //   worker(2, devices2),
    //   worker(3, devices3),
    // ]);
    await processDevice();
    console.log("✅ Attendance migration finished");
  } catch (err) {
    console.error("❌ Migration failed", err);
  } finally {
    await sourcePool.end();
    await targetPool.end();
    process.exit(0);
  }
})();

/* ======================
   GRACEFUL SHUTDOWN
====================== */

process.on("SIGINT", async () => {
  console.log("🛑 SIGINT received, closing pools...");
  await sourcePool.end();
  await targetPool.end();
  process.exit(0);
});



// const devicestahap1 = [140,142,440];
// const devicestahap2 = [416,419,418];
// const devicestahap3 = [398,415,72];
// const devicestahap4 = [13,424,123];
// const devicestahap5 = [20,30,28]; 
// const devicestahap6 = [89,425,389]; 
// const devicestahap7 = [395,216,365]; 
// const devicestahap8 = [98,177,143];
// const devicestahap9 = [218,151,182];
// const devicestahap10 = [337,252,125]; 
// const devicestahap11 = [323,91,364];
// const devicestahap12 = [52,289,333,]; 
// const devicestahap13 = [215,124,94];
// const devicestahap14 = [196,359,4]; 
// const devicestahap15 = [300,44,134,]; 
// const devicestahap16 = [275,64,118];
// const devicestahap17 = [332,336,251];
// const devicestahap18 = [174,3,366];
// const devicestahap19 = [392,93,328];
// const devicestahap20 = [15,19,431]
// const devicestahap21 = [409,31,233]
// const devicestahap22 = [414,411,432]
// const devicestahap23 = [421,65,410]
// const devicestahap24 = [372,180,435]
// const devicestahap25 = [77,412,295]
// const devicestahap26 = [420,422,423]
// const devicestahap27 = [429,179,36]
// const devicestahap28 = [131,428,417]
// const devicestahap29 = [430,29,26]
// const devicestahap30 = [247,340,114]
// const devicestahap31 = [115,388,154]
// const devicestahap32 = [330,408,43]
// const devicestahap33 = [298,163, 17]
// const devicestahap34 = [176,181,413] 
// const devicestahap35 = [436,362,367]
// const devicestahap36 = [439,426,25] 
// const devicestahap37 = [390,434,405]
// const devicestahap38 = [46,394,255]
// const devicestahap39 = [370,284, 141]
// const devicestahap40 = [33,10,194]   
// const devicestahap41 = [296,427,294]
// const devicestahap42 = [119,316,133]
// const devicestahap43 = [12,2,99]
// const devicestahap44 = [321, 319, 117]  
// const devicestahap45 = [136,40,297]
// const devicestahap46 = [391,55,437]
// const devicestahap47 = [113,338,322]  
// const devicestahap48 = [393,438,48]
// const devicestahap49 = [313,95,191]
// const devicestahap50 = [47,334,224]
// const devicestahap51 = [335,14,288] 
// const devicestahap52 = [286,249,158] 
// const devicestahap53 = [69, 197, 42] 
// const devicestahap54 = [45,327,234] 
// const devicestahap55 = [207,51,357] 
// const devicestahap56 = [331,245,56]
// const devicestahap57 = [329,375,192] 
// const devicestahap58 = [90,38,7] 
// const devicestahap59 = [97,116,339]
// const devicestahap60 = [291,232,34] 
// const devicestahap61 = [76,35,70] 
// const devicestahap62 = [324,92,59] 
// const devicestahap63 = [175, 223]