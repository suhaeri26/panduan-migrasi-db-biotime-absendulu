import axios from "axios";

const API_URL = "http://localhost:8081/api/attendances/recalculate";

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

async function run() {
  let start = new Date("2024-08-01");
  let end = new Date("2025-12-29");
  // let start = new Date("202-08-01");
  // let end = new Date("2025-12-29");

  while (start <= end) {
    const dateStr = formatDate(start);

    try {
      console.log("Proses:", dateStr);

      const response = await axios.get(API_URL, {
        params: {
          startDate: dateStr,
          endDate: dateStr,
        }
      });

      console.log("✔ Sukses:", dateStr, response);
    } catch (err) {
      console.error("❌ Gagal:", dateStr, err.message);
    }

    // tambah 1 hari
    start.setDate(start.getDate() + 1);
  }

  console.log("🎉 Selesai semua!");
}

run();
