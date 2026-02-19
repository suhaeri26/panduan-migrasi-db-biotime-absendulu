import cron from 'node-cron';
import { pgPool, pgPool2 } from '../db';
import axios from 'axios';
import { kirimData, token } from '../healper';

export const startDeviceEmployeeTemplateSync = () => {
  // Schedule setiap 25 detik
  cron.schedule('*/3 * * * * *', async () => {
    console.log("__________ Memulai ___________")
    try {
      const result = await pgPool.query(`
        SELECT 
            ib.id             AS "id",
            e.emp_code       AS "employeeId",
            ib.sn     AS "deviceSn",
            ib.bio_type        AS "templateType",
            ib.bio_no AS "fid",
            ib.bio_index  AS "index",
            ib.valid     AS "valid",
            ib.duress  AS "duress",
            ib.major_ver      AS "majorver",
            ib.minor_ver AS "minorver",
            ib.bio_format        AS "format",
            ib.bio_tmp        AS "data"
        FROM iclock_biodata ib 
        LEFT JOIN personnel_employee e
            ON ib.employee_id = e.id
        WHERE ib."issend" = false
        LIMIT 250;
      `);

      const employeesTempalte = result.rows;
      if (employeesTempalte.length === 0) {
        console.log('✅ No new employee templates to sync');
        return;
      }

      // console.log({filteredEmployees: JSON.stringify(filteredEmployees), filteredUsers: JSON.stringify(filteredUsers)});
      // Kirim ke MySQL writer
      const payload = employeesTempalte.map((x)=>({...x, size: x.data.length}))
      const response = await kirimData(payload, "api/v1/device-template/bulk-create");

      // Update isSend = true
      const empCodes = employeesTempalte.map(e => e.id);
      await pgPool.query(`
        UPDATE iclock_biodata
        SET "issend" = true
        WHERE id = ANY($1)
      `, [empCodes]);
      console.log({response});
      console.log(`✅ Synced ${employeesTempalte.length} employees`);
    } catch (err) {
      console.error('❌ Error syncing employees:', (err as any).message || err);
    }
  });
};