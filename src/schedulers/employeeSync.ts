import cron from 'node-cron';
import { pgPool, pgPool2 } from '../db';
import axios from 'axios';
import { kirimData, token } from '../healper';

export const startAreaSync = () => {
  // Schedule setiap 25 detik
  cron.schedule('*/10 * * * * *', async () => {
    console.log("__________ Memulai ___________")
    try {
      const result = await pgPool.query(`
        SELECT 
          id AS "areaId",
          area_code AS "areaCode",
          area_name AS "areaName",
          parent_area_id AS "superior"
        FROM personnel_area
        LIMIT 1000
      `);

      const areas = result.rows;
      if (areas.length === 0) {
        console.log('✅ No new employees to sync');
        return;
      }

      const filteredAreas = areas.map((a)=>{
        delete a.id
        return {
          ...a,
          organizationId:1,
          organizationName: "PT Bakrie Sumatera Plantations Tbk"
        }
      })
      //bulk insert dengan pgpoll2
      await pgPool2.query(`
      INSERT INTO "areas" (
        "areaId",
        "areaCode",
        "areaName",
        "superior",
        "organizationId",
        "organizationName",
        "createdAt",
        "updatedAt"
      ) VALUES ${filteredAreas.map((a, i) => `(
        ${a.areaId},
        '${a.areaCode}',
        '${a.areaName}',
        ${a.superior ?? 'NULL'},
        ${a.organizationId},
        '${a.organizationName}',
        NOW(),
        NOW()
      )`).join(', ')}
      ON CONFLICT ("areaId") DO UPDATE SET
        "areaCode" = EXCLUDED."areaCode",
        "areaName" = EXCLUDED."areaName",
        "superior" = EXCLUDED."superior",
        "organizationId" = EXCLUDED."organizationId",
        "organizationName" = EXCLUDED."organizationName";
    `);

      console.log(`✅ Synced ${areas.length} areas`);

    } catch (err) {
      console.error('❌ Error syncing areas:', (err as any).message || err);
    }
  });
};
export const startDepartmentSync = () => {
  // Schedule setiap 25 detik
  cron.schedule('*/10 * * * * *', async () => {
    console.log("__________ Memulai ___________")
    try {
      const result = await pgPool.query(`
        SELECT 
          id AS "departmentId",
          dept_code AS "departmentName",
          dept_name AS "departmentCode",
          parent_dept_id AS "superior"
        FROM personnel_department
        LIMIT 700
      `);

      const areas = result.rows;
      if (areas.length === 0) {
        console.log('✅ No new employees to sync');
        return;
      }

      const filteredAreas = areas.map((a)=>{
        delete a.id
        return {
          ...a,
          organizationId:1,
          organizationName: "PT Bakrie Sumatera Plantations Tbk"
        }
      })
      // Kirim ke MySQL writer
      // const response = await axios.post("http://localhost:4000/import/departments", filteredAreas);
      // console.log({response: response.data})
      await pgPool2.query(`
      INSERT INTO "departments" (
        "departmentId",
        "departmentCode",
        "departmentName",
        "superior",
        "organizationId",
        "organizationName",
        "createdAt",
        "updatedAt"
      ) VALUES ${filteredAreas.map((a, i) => `(
        ${a.departmentId},
        '${a.departmentCode}',
        '${a.departmentName}',
        ${a.superior ?? 'NULL'},
        ${a.organizationId},
        '${a.organizationName}',
        NOW(),
        NOW()
      )`).join(', ')}
      ON CONFLICT ("departmentId") DO UPDATE SET
        "departmentCode" = EXCLUDED."departmentCode",
        "departmentName" = EXCLUDED."departmentName",
        "superior" = EXCLUDED."superior",
        "organizationId" = EXCLUDED."organizationId",
        "organizationName" = EXCLUDED."organizationName";
    `);
      console.log(`✅ Synced ${areas.length} departments`);
    } catch (err) {
      console.error('❌ Error syncing departments:', (err as any).message || err);
    }
  });
};
export const startDeviceSync = () => {
  // Schedule setiap 25 detik
  cron.schedule('*/10 * * * * *', async () => {
    console.log("__________ Memulai ___________")
    try {
      const result = await pgPool.query(`
        SELECT 
          t.id AS "deviceId",
          t.sn AS "deviceSN",
          t.ip_address AS "deviceIp",
          t.terminal_tz AS "timezone",
          t.heartbeat AS "heartbeat",
          t.transfer_mode AS "transferMode",
          t.transfer_interval AS "transferInterval",
          t.transfer_time AS "transferTime",
          t.fw_ver AS "firmwareVersion",
          t.is_attendance AS "isAttendance",
          t.user_count AS "totalEnrolledUser",
          t.fp_count AS "totalEnrolledFingerprint",
          t.face_count AS "totalEnrolledFace",
          a.id AS "areaId",
          a.area_name AS "areaName",
          t.alias AS "deviceName"
        FROM iclock_terminal t
        LEFT JOIN personnel_area a ON t.area_id = a.id
        LIMIT 300;
      `);

      const devices = result.rows;
      if (devices.length === 0) {
        console.log('✅ No new devices to sync');
        return;
      }

      const filteredDevices = devices.map((a)=>{
        return {
          ...a,
          type:"Zk",
        }
      })
      await pgPool2.query(`
      INSERT INTO "devices" (
        "deviceId",
        "deviceSN",
        "deviceIp",
        "timezone",
        "heartbeat",
        "transferMode",
        "transferInterval",
        "transferTime",
        "firmwareVersion",
        "isAttendance",
        "totalEnrolledUser",
        "totalEnrolledFingerprint",
        "totalEnrolledFace",
        "areaId",
        "areaName",
        "deviceName",
        "type",
        "createdAt",
        "updatedAt"
      ) VALUES ${filteredDevices.map((a, i) => `(
        ${a.deviceId},
        '${a.deviceSN}',
        '${a.deviceIp}',
        '${a.timezone}',
        ${a.heartbeat},
        '${a.transferMode}',
        ${a.transferInterval},
        '${a.transferTime}',
        '${a.firmwareVersion}',
        ${a.isAttendance == 1 ? true : false},
        ${a.totalEnrolledUser},
        ${a.totalEnrolledFingerprint},
        ${a.totalEnrolledFace},
        ${a.areaId ?? 'NULL'},
        '${a.areaName ?? ''}',
        '${a.deviceName ?? ''}',
         '${a.type}',
        NOW(),
        NOW()
      )`).join(', ')}
      ON CONFLICT ("deviceId") DO UPDATE SET
          "deviceSN" = EXCLUDED."deviceSN",
          "deviceIp" = EXCLUDED."deviceIp", 
          "timezone" = EXCLUDED."timezone", 
          "heartbeat" = EXCLUDED."heartbeat", 
          "transferMode" = EXCLUDED."transferMode", 
          "transferInterval" = EXCLUDED."transferInterval", 
          "transferTime" = EXCLUDED."transferTime", 
          "firmwareVersion" = EXCLUDED."firmwareVersion", 
          "isAttendance" = EXCLUDED."isAttendance", 
          "totalEnrolledUser" = EXCLUDED."totalEnrolledUser", 
          "totalEnrolledFingerprint" = EXCLUDED."totalEnrolledFingerprint", 
          "totalEnrolledFace" = EXCLUDED."totalEnrolledFace", 
          "areaId" = EXCLUDED."areaId", 
          "areaName" = EXCLUDED."areaName", 
          "deviceName" = EXCLUDED."deviceName";
    `);
        
      // Kirim ke MySQL writer
      // const response = await axios.post("http://localhost:4000/import/devices", filteredDevices);
      // console.log({response: response.data})
      console.log(`✅ Synced ${filteredDevices.length} devices`);
    } catch (err) {
      console.error('❌ Error syncing areas:', (err as any).message || err);
    }
  });
};

const BATCH_SIZE = 35;
const MAX_DATA = 350;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export const startAttendancesSync = (deviceId: number) => {
  cron.schedule("*/3 * * * * *", async () => {
    console.log("🚀 Sync started...");

    try {
      const result = await pgPool.query(`
        SELECT 
          t.id,
          t.terminal_sn AS "deviceSn",
          t.terminal_id AS "deviceId",
          t.emp_code AS pin,
          t.punch_time AS "atttime",
          t.punch_state AS "attstatus",
          t.verify_type AS "verify",
          t.work_code AS "workCode",
          t.is_mask AS "maskflag",
          t.temperature
        FROM iclock_transaction t
        JOIN personnel_employee e ON t.emp_code = e.emp_code
        WHERE t."issend" = false AND t.terminal_id = ${deviceId}
        LIMIT ${MAX_DATA};
      `);

      const rows = result.rows;
      if (rows.length === 0) {
        console.log("✅ Tidak ada data");
        return;
      }
      await pgPool2.query(`
      INSERT INTO "deviceattendances" (
        "deviceSn",
        "deviceId",
        "pin",
        "atttime",
        "attstatus",
        "verify",
        "workCode",
        "maskflag",
        "temperature",
        "deviceName",
        "areaName",
        "createdAt",
        "updatedAt"
      ) VALUES ${rows.map((a, i) => `(
        $${i * 11 + 1},
        $${i * 11 + 2},
        $${i * 11 + 3},
        $${i * 11 + 4},
        $${i * 11 + 5},
        $${i * 11 + 6},
        $${i * 11 + 7},
        $${i * 11 + 8},
        $${i * 11 + 9},
        $${i * 11 + 10},
        $${i * 11 + 11},
        NOW(),
        NOW()
      )`).join(', ')}`,
        rows.flatMap(r => [
          r.deviceSn,
          r.deviceId,
          r.pin,
          r.atttime,
          r.attstatus,
          r.verify,
          r.workCode,
          r.maskflag,
          r.temperature
        ])
      );

      console.log(`✅ Synced ${rows.length} attendances`);

    } catch (err: any) {
      console.error("❌ Sync error:", err.message);
    }
  });
};



export const startUsersSync = () => {
  cron.schedule("*/1 * * * * *", async () => {
    console.log("🚀 Sync started...");

    try {
      const result = await pgPool.query(`
        SELECT
          u.id as "userId",
          u.username as "username",
          u.email as "email",
          u.first_name as "firstName",
          u.last_name as "lastName",
          g.id   AS "groupId",
          g.name AS "groupName"
        FROM auth_user u
        JOIN auth_user_groups ug
          ON ug.myuser_id = u.id
        JOIN auth_group g
          ON g.id = ug.group_id;
      `);

      const rows = result.rows;
      if (rows.length === 0) {
        console.log("✅ Tidak ada data");
        return;
      }

      const payload = rows.map(({ userId, username, email, firstName, lastName, groupName }) => ({
        userId,
        username,
        email,
        accountName: `${firstName} ${lastName}`,
        userType: convertBA(groupName),
        userGroupId: convertBAI(groupName),
        defaultOrganizationId: 1
      }));
      await pgPool2.query(`
      INSERT INTO "users" (
        "userId",
        "username",
        "email",
        "accountName",
        "userType",
        "userGroupId",
        "defaultOrganizationId",
        "createdAt",
        "updatedAt"
      ) VALUES ${payload.map((p, i) => `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7}, NOW(), NOW())`).join(", ")}`,
        payload.flatMap(p => [p.userId, p.username, p.email, p.accountName, p.userType, p.userGroupId, p.defaultOrganizationId])
      );

      console.log(`✅ Synced ${rows.length} users`);
        
    } catch (err: any) {
      console.error("❌ Sync error:", err.message);
    }
  });
};


const convertBA = (ba: "HR-UNIT" | "view-device" | "view-only" | "IT-UNIT" | "REPORT PRESENSI SAJA"): string => {
  switch (ba) {
    case "HR-UNIT":
      return "adminOrg";
    case "view-device":
      return "device";
    case "view-only":
      return "viewOnly";
    case "IT-UNIT":
      return "ITUnit";
    case "REPORT PRESENSI SAJA":
      return "reportAttendance";
    default:
      return ba;
  }
}
const convertBAI = (ba: "HR-UNIT" | "view-device" | "view-only" | "IT-UNIT" | "REPORT PRESENSI SAJA"): number => {
  switch (ba) {
    case "HR-UNIT":
      return 3;
    case "view-device":
      return 5;
    case "view-only":
      return 7;
    case "IT-UNIT":
      return 6;
    case "REPORT PRESENSI SAJA":
      return 4;
    default:
      return ba;
  }
}


export const startAttendancesSync2 = () => {
  cron.schedule("*/2 * * * * *", async () => {
    console.log("🚀 Sync started...");

    try {
      const result = await pgPool.query(`
        SELECT 
          t.id,
          t.terminal_sn AS "deviceSn",
          t.terminal_alias AS "deviceName",
          t.area_alias AS "areaName",
          t.terminal_id AS "deviceId",
          t.emp_code AS pin,
          t.punch_time AS "atttime",
          t.punch_state AS "attstatus",
          t.verify_type AS "verify",
          t.work_code AS "workCode",
          t.is_mask AS "maskflag",
          t.temperature
        FROM iclock_transaction t
        JOIN personnel_employee e ON t.emp_code = e.emp_code
        WHERE t."issend" = false
        LIMIT 1000;
      `);

      const rows = result.rows;
      if (rows.length === 0) {
        console.log("✅ Tidak ada data");
        return;
      }

      await pgPool2.query(`
      INSERT INTO "deviceattendances" (
        "deviceSn",
        "deviceId",
        "pin",
        "atttime",
        "attstatus",
        "verify",
        "workCode",
        "maskflag",
        "temperature",
        "deviceName",
        "areaName",
        "createdAt",
        "updatedAt"
      ) VALUES ${rows.map((r, i) => `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9}, $${i * 9 + 10}, NOW(), NOW())`).join(", ")}`,
        rows.flatMap(r => [
          r.deviceSn,
          r.deviceId,
          r.pin,
          r.atttime,
          parseInt(r.attstatus),
          r.verify,
          r.workCode || null,
          r.maskflag,
          r.temperature !== null ? Number(r.temperature) : 0,
          r.deviceName,
          r.areaName
        ])
      );

      const ids = rows.map(r => r.id);
      await pgPool.query(
        `UPDATE iclock_transaction 
         SET "issend" = true 
         WHERE id = ANY($1)`,
        [ids]
      );

      console.log(`✅ Synced ${rows.length} attendances`);

    } catch (err: any) {
      console.error("❌ Sync error:", err.message);
    }
  });
};


export const startUsersHasAreaSync = () => {
  cron.schedule("*/1 * * * * *", async () => {
    console.log("🚀 Sync started...");

    try {
      const result = await pgPool.query(`
        SELECT
          u.myuser_id as "userId",
          u.area_id as "areaId"
        FROM auth_user_auth_area u
      `);

      const rows = result.rows;
      if (rows.length === 0) {
        console.log("✅ Tidak ada data");
        return;
      }

      const payload = rows.map(({ userId, areaId }) => ({
        userId,
        areaId
      })); 
      await pgPool2.query(`
      INSERT INTO "users_has_areas" (
        "userId",
        "areaId",
        "createdAt",
        "updatedAt"
      ) VALUES ${payload.map((p, i) => `($${i * 2 + 1}, $${i * 2 + 2}, NOW(), NOW())`).join(", ")}`,
        payload.flatMap(p => [p.userId, p.areaId])
      );

      console.log(`✅ Synced ${rows.length} users has areas`);
        
    } catch (err: any) {
      console.error("❌ Sync error:", err.message);
    }
  });
};