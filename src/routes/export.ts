import express from 'express';
import { pgPool } from '../db';
import axios from 'axios';

const router = express.Router();

router.get('/employees', async (_req, res) => {
  try {
    const result = await pgPool.query(`
        SELECT 
          emp_code AS "employeeId",
          first_name AS "employeeName",
          card_no AS "cardNo",
          device_password AS "devicePassword",
          dev_privilege AS "devPrivilege",
          office_tel AS "officeTel"
        FROM personnel_employee
        WHERE "isSend" = false
        LIMIT 3000
      `);
    const employees = result.rows;
    await axios.post("http://localhost:4000/import/employees", employees)
    const empCodes = employees.map(e => `'${e.employeeId}'`).join(',');
    await pgPool.query(`
      UPDATE personnel_employee
      SET "isSend" = true
      WHERE emp_code IN (${empCodes})
    `);

    res.status(200).json(employees);
  } catch (error) {
    res.status(500).json(error)
  }
});

router.get('/device-attendances', async (_req, res) => {
  const result = await pgPool.query(`
    SELECT 
      id,
      terminal_sn AS "deviceSn",
      emp_code AS pin,
      punch_time AS "atttime",
      punch_state AS "attstatus",
      verify_type AS "verify",
      work_code AS "workCode",
      is_mask AS "maskflag",
      temperature
    FROM iclock_transaction
    WHERE "isSend" = false
    LIMIT 3000
  `);
    const attendances = result.rows;
    await axios.post("http://localhost:4000/import/employees", attendances)
    const empCodes = attendances.map(e => `'${e.id}'`).join(',');
    await pgPool.query(`
      UPDATE personnel_employee
      SET "isSend" = true
      WHERE id IN (${empCodes})
    `);
  res.json(attendances);
});

export default router;
