import "dotenv/config";
import fs from "fs";
import https from "https";
import { parse } from "csv-parse/sync";

// =====================
// INPUT
// =====================
const TASKS_CSV = "./input/tasks.csv";

// =====================
// ENV
// =====================
const token = process.env.ASANA_TOKEN;
if (!token) throw new Error("Falta ASANA_TOKEN en .env");

if (!fs.existsSync(TASKS_CSV)) {
  throw new Error(`No existe: ${TASKS_CSV}`);
}

// =====================
// SSL corporativo
// =====================
const agent = new https.Agent({ rejectUnauthorized: false });

// =====================
// Helper POST Asana
// =====================
function asanaPost(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ data });

    const req = https.request(
      {
        hostname: "app.asana.com",
        path: `/api/1.0${path}`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        agent
      },
      (res) => {
        let body = "";
        res.on("data", c => (body += c));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
          resolve(JSON.parse(body));
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// =====================
// MAIN
// =====================
const csvContent = fs.readFileSync(TASKS_CSV, "utf8");
const tasks = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true
});

// Validación mínima
for (const [i, t] of tasks.entries()) {
  if (!t.project_gid || !t.name) {
    throw new Error(
      `Fila ${i + 2} inválida: requiere project_gid y name`
    );
  }
}

for (const task of tasks) {
  console.log(`Creando tarea en proyecto ${task.project_gid}: ${task.name}`);

  const created = await asanaPost("/tasks", {
    name: task.name,
    notes: task.notes ?? "",
    projects: [task.project_gid]
  });

  console.log(`✔ Tarea creada: ${created.data.gid}`);
}

console.log("\nProceso finalizado ✅");
