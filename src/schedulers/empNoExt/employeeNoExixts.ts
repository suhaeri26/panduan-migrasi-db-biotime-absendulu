import cron from "node-cron";
import { pgPool2 } from "../../db";
import { data } from "./data";

export const startEmployeeNoExistsSync = () => {
  cron.schedule("*/30 * * * * *", async () => {
    console.log("🚀 Sync started...");

    try {
      if (!data.length) return;

      const values: any[] = [];
      const rows = data.map((a, i) => {
        const base = i * 4;
        values.push(
          a.emp_code,
          new Date(),
          new Date(),
          new Date()
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      });

      const query = `
        INSERT INTO employees (
          "employeeId",
          "deletedAt",
          "createdAt",
          "updatedAt"
        )
        VALUES ${rows.join(",")}
        ON CONFLICT ("employeeId") DO NOTHING
      `;

      await pgPool2.query(query, values);

      console.log("✅ Sync done");
    } catch (err: any) {
      console.error("❌ Sync error:", err.message);
    }
  });
};
