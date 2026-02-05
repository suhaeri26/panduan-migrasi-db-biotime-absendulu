import cron from 'node-cron';
import { pgPool, pgPool2 } from '../db';
import axios from 'axios';
import { kirimData, token } from '../healper';

export const startEmployeeHasAreaSync = () => {
  // Schedule setiap 25 detik
  cron.schedule('*/1 * * * * *', async () => {
    console.log("__________ Memulai Sync Employee-Has-Areas ___________");

    try {
        // 1. Ambil data area yang belum di-send
        const result = await pgPool.query(`
        SELECT 
            ea.id,                              -- ID dari personnel_employee_area
            e.emp_code AS "employeeId",         -- Kode karyawan
            ea.area_id AS "areaId"               -- ID area
        FROM personnel_employee_area ea
        LEFT JOIN personnel_employee e
            ON ea.employee_id = e.id
        WHERE ea."issend" = false
        LIMIT 1000;
        `);

        const areas = result.rows;

        if (areas.length === 0) {
        console.log('✅ Tidak ada data baru untuk di-sync');
        return;
        }

        // 2. Kirim ke API tujuan
        const payload = areas.map(x => ({
        employeeId: x.employeeId,
        areaId: x.areaId,
        }));

        const values: any[] = [];
        const placeholders = payload
          .map((row, i) => {
            const base = i * 2;
            values.push(row.employeeId, row.areaId);
            return `($${base + 1}, $${base + 2}, NOW(), NOW())`;
          })
          .join(",");

        await pgPool2.query(
          `
          INSERT INTO "employees_has_areas" (
            "employeeId", "areaId", "createdAt", "updatedAt"
          )
          VALUES ${placeholders}
          `,
          values
        );

        // 4. Tandai sudah terkirim
        const areaIds = areas.map(e => e.id);

        await pgPool.query(
          `
          UPDATE personnel_employee_area
          SET "issend" = true
          WHERE id = ANY($1::int[])
          `,
          [areaIds]
        );

        // 5. Logging
        console.log(`✅ Synced ${areas.length} employee-has-areas`);

    } catch (err) {
        console.error('❌ Error syncing has areas:', (err as any).message || err);
    }
    });

};

export const startEmployeeRevisiSync = () => {
  // Schedule setiap 25 detik
  cron.schedule('*/1 * * * * *', async () => {
    console.log("__________ Memulai ___________")
    try {
      const result = await pgPool.query(`
        SELECT 
            e.id             AS "id",
            e.emp_code       AS "employeeId",
            e.first_name     AS "employeeName",
            e.card_no        AS "cardNo",
            e.device_password AS "devicePassword",
            e.dev_privilege  AS "devPrivilege",
            e.office_tel     AS "officeTel",
            e.department_id  AS "departmentId",
            e.enroll_sn      AS "enrollSn",
            d.dept_name AS "departmentName",
            r.resign_date        AS "resignedDate",
            r.reason             AS "resignedReason",
            r.resign_type        AS "resignedType"
        FROM personnel_employee e
        LEFT JOIN personnel_department d
            ON e.department_id = d.id
        LEFT JOIN personnel_resign r
            ON e.id = r.employee_id
        WHERE e."issend" = false
        LIMIT 20;
      `);

      const employees = result.rows;
      if (employees.length === 0) {
        console.log('✅ No new employees to sync');
        return;
      }
      const count = await axios.get("http://test-presensi.bakriesumatera.com:8081/api/users/findAndCount?filter[limit]=1", {headers: {Authorization: `Bearer ${token}`}});
      const filteredUsers = employees.map((a, i)=>{
        return {
          username: a.employeeId,
          password: "$2a$08$poC.L8MsIiVu7WELehUlfe1DPTNTnxVMtZLox8N9x32zclcCX7Q0y",
          accountName: a.employeeName || "-",
          userType: "employee",
          userGroupId: 2,
          defaultOrganizationId: 1,
          userId: count.data.count + (i + 100),
          isVerified: false,
        }
      })
      const filteredEmployees = employees.map((a, i)=>{
        return {
          ...a,
          employeeTypeId: 1,
          employeeTypeName: "Permanent",
          organizationId:1,
          organizationName: "PT Bakrie Sumatera Plantations Tbk",
          resigned: a.resignedDate ? true : false,
          resignedDate: a.resignedDate ? a.resignedDate : null,
          resignedReason: a.resignedReason ? a.resignedReason : null,
          resignedType: a.resignedType ? typeResignConvert(a.resignedType) : null,
        }
      })
      // console.log({filteredEmployees: JSON.stringify(filteredEmployees), filteredUsers: JSON.stringify(filteredUsers)});
      // Kirim ke MySQL writer
      const response = await kirimData({employees: filteredEmployees}, "api/bulk-create-employees");
      const response2 = await kirimData(filteredUsers, "api/users/bulk-create");

      // Update isSend = true
      const empCodes = employees.map(e => e.employeeId);
      await pgPool.query(`
        UPDATE personnel_employee
        SET "issend" = true
        WHERE emp_code = ANY($1)
      `, [empCodes]);
      console.log({response});
      console.log({response2});
      console.log(`✅ Synced ${employees.length} employees`);
    } catch (err) {
      console.error('❌ Error syncing employees:', (err as any).message || err);
    }
  });
};


const typeResignConvert=(typeResign: number): string => {
  switch(typeResign) {
    case 1:
      return "Quit";
    case 2:
      return "Terminated";
    case 3:
      return "resigned";
    case 4:
      return "Transfer";
    case 5:
      return "Retqin Job Without Salary";
    default:
      return "Other";
  }
}


export const startEmployeeRevisiSync2 = () => {
  cron.schedule("*/5 * * * * *", async () => {
    const client = await pgPool2.connect();

    try {
      console.log("🚀 Start Employee Sync");

      // ===============================
      // 1. Ambil data sumber
      // ===============================
      const { rows: employees } = await pgPool.query(`
        SELECT 
          e.id,
          e.emp_code AS "employeeId",
          e.first_name AS "employeeName",
          e.card_no AS "cardNo",
          e.device_password AS "devicePassword",
          e.dev_privilege AS "devPrivilege",
          e.office_tel AS "officeTel",
          e.department_id AS "departmentId",
          e.enroll_sn AS "enrollSn",
          d.dept_name AS "departmentName",
          r.resign_date AS "resignedDate",
          r.reason AS "resignedReason",
          r.resign_type AS "resignedType"
        FROM personnel_employee e
        LEFT JOIN personnel_department d ON e.department_id = d.id
        LEFT JOIN personnel_resign r ON e.id = r.employee_id
        WHERE e."issend" = false
        LIMIT 2400;
      `);
        console.log(`🔍 Ditemukan ${employees.length} employees untuk disinkronisasi`);
      if (!employees.length) {
        console.log("✅ Tidak ada data baru");
        return;
      }

      // ===============================
      // 2. Mapping data
      // ===============================
      const users = employees.map((e, i) => ({
        username: e.employeeId,
        password: "$2a$08$poC.L8MsIiVu7WELehUlfe1DPTNTnxVMtZLox8N9x32zclcCX7Q0y",
        accountName: e.employeeName || "-",
        userType: "employee",
        userGroupId: 2,
        defaultOrganizationId: 1,
        userId: i + 9201
      }));

      const employeesMapped = employees.map(e => ({
        ...e,
        employeeTypeId: 1,
        employeeTypeName: "Permanent",
        organizationId: 1,
        organizationName: "PT Bakrie Sumatera Plantations Tbk",
        resigned: !!e.resignedDate,
        userId: users.find(u => u.username === e.employeeId)?.userId,
        resignedType: e.resignedType ? typeResignConvert(e.resignedType) : null,
      }));

      // ===============================
      // 3. TRANSACTION START
      // ===============================
      await client.query("BEGIN");

      // ===============================
      // 4. INSERT EMPLOYEES
      // ===============================
      const empValues: any[] = [];
      const empPlaceholders: string[] = [];

      employeesMapped.forEach((e, i) => {
        const p = i * 18;
        empPlaceholders.push(`(
          $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4},
          $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8},
          $${p + 9}, $${p +10}, $${p +11}, $${p +12},
          $${p +13}, $${p +14}, $${p +15}, $${p +16},
          $${p +17}, $${p +18},
          NOW(), NOW()
        )`);

        empValues.push(
          e.employeeId,
          e.employeeName,
          e.cardNo,
          e.devicePassword,
          e.devPrivilege,
          e.officeTel,
          e.departmentId,
          e.enrollSn,
          e.departmentName,
          e.resignedDate,
          e.resignedReason,
          e.resignedType,
          e.employeeTypeId,
          e.employeeTypeName,
          e.organizationId,
          e.organizationName,
          e.resigned,
          e.userId
        );
      });

      // ===============================
      // 5. INSERT USERS
      // ===============================
      const userValues: any[] = [];
      const userPlaceholders: string[] = [];

      users.forEach((u, i) => {
        const p = i * 7;
        userPlaceholders.push(`(
          $${p + 1}, $${p + 2}, $${p + 3},
          $${p + 4}, $${p + 5}, $${p + 6},
          $${p + 7}, false, NOW(), NOW()
        )`);

        userValues.push(
          u.username,
          u.password,
          u.accountName,
          u.userType,
          u.userGroupId,
          u.defaultOrganizationId,
          u.userId
        );
      });

      await client.query(`
        INSERT INTO "users" (
          "username","password","accountName",
          "userType","userGroupId",
          "defaultOrganizationId","userId",
          "isVerified","createdAt","updatedAt"
        )
        VALUES ${userPlaceholders.join(",")}
      `, userValues);
      await client.query(`
        INSERT INTO "employees" (
          "employeeId","employeeName","cardNo","devicePassword",
          "devPrivilege","officeTel","departmentId","enrollSn",
          "departmentName","resignedDate","resignedReason","resignedType",
          "employeeTypeId","employeeTypeName",
          "organizationId","organizationName",
          "resigned","userId",
          "createdAt","updatedAt"
        )
        VALUES ${empPlaceholders.join(",")}
      `, empValues);
      // ===============================
      // 6. UPDATE SOURCE
      // ===============================
      await pgPool.query(`
        UPDATE personnel_employee
        SET "issend" = true
        WHERE emp_code = ANY($1)
      `, [employees.map(e => e.employeeId)]);

      await client.query("COMMIT");

      console.log(`✅ Synced ${employees.length} employees`);

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ SYNC FAILED:", err);
    } finally {
      client.release();
    }
  });
};
