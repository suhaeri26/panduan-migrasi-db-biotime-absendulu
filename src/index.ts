import express from 'express';
import dotenv from 'dotenv';
import exportRoutes from './routes/export';
import { startEmployeeHasAreaSync, startEmployeeRevisiSync2 } from './schedulers/revisiSync';
import { startAreaSync, startDepartmentSync, startDeviceSync, startUsersHasAreaSync, startUsersSync } from './schedulers/employeeSync';
import { startEmployeeNoExistsSync } from './schedulers/empNoExt/employeeNoExixts';
import { pgPool } from './db';


dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use('/export', exportRoutes);

/// ini yg akan di jalan kan 1 per 1 yak
// startAreaSync();
// startDepartmentSync();
// startDeviceSync();
// startUsersSync();
// startEmployeeRevisiSync2();
// startEmployeeHasAreaSync();
// startUsersHasAreaSync();
// startEmployeeNoExistsSync()

app.listen(port, () => {
  console.log(`Postgres reader listening on port ${port}`);
});
