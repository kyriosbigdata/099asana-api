import "dotenv/config";
import fs from "fs";
import path from "path";
import https from "https";
import { parse } from "csv-parse/sync";

// =====================
// INPUT / OUTPUT
// =====================
const INPUT_CSV  = "./input/tasks.csv";
const OUTPUT_DIR = "./output";
const OUTPUT_JSON = path.join(OUTPUT_DIR, "./tasks.created.json");
const OUTPUT_CSV  = path.join(OUTPUT_DIR, "./tasks.created.csv");

// =====================
// ENV
// =====================
const token = process.env.ASANA_TOKEN;
if (!token) throw new Error("Falta ASANA_TOKEN en .env");

// =====================
// VALIDACIONES / DIR
// =====================
if (!fs.existsSync(INPUT_CSV)) throw new Error(`No existe: ${INPUT_CSV}`);
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// =====================
// SSL corporativo
// =====================
const agent = new https.Agent({ rejectUnauthorized: false });

// =====================
// Helper POST Asana
// =====================
function asanaPost(pathname, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ data });

    const req = https.request(
      {
        hostname: "app.asana.com",
        path: `/api/1.0${pathname}`,
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

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function cleanStr(v) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function parseFollowers(v) {
  const s = cleanStr(v);
  if (!s) return null;
  const arr = s.split("|").map(x => x.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

// =====================
// MAIN
// =====================
const csvContent = fs.readFileSync(INPUT_CSV, "utf8");
const rows = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true
});

// Validación mínima
for (const [i, r] of rows.entries()) {
  if (!cleanStr(r.project_gid) || !cleanStr(r.name)) {
    throw new Error(`Fila ${i + 2} inválida: requiere project_gid y name`);
  }
}

const report = [];

for (const [idx, r] of rows.entries()) {
  const projectGid = cleanStr(r.project_gid);
  const name = cleanStr(r.name);
  const notes = cleanStr(r.notes);

  console.log(`Creando tarea (${idx + 1}/${rows.length}) en ${projectGid}: ${name}`);

  // ✅ Campos opcionales: si vienen vacíos, NO se envían
  const payload = {
    name,
    projects: [projectGid]
  };

  if (notes) payload.notes = notes;

  const assigneeGid = cleanStr(r.assignee_gid);
  if (assigneeGid) payload.assignee = assigneeGid;

  const dueOn = cleanStr(r.due_on);
  if (dueOn) payload.due_on = dueOn;

  const startOn = cleanStr(r.start_on);
  if (startOn) payload.start_on = startOn;

  const followers = parseFollowers(r.followers);
  if (followers) payload.followers = followers;

  try {
    const created = await asanaPost("/tasks", payload);

    report.push({
      status: "created",
      project_gid: projectGid,
      task_gid: created.data.gid,
      task_name: created.data.name,
      // guardamos también lo que enviaste (útil para trazabilidad)
      due_on: dueOn ?? "",
      assignee_gid: assigneeGid ?? ""
    });

    console.log(`✔ Task creada: ${created.data.gid}`);
  } catch (err) {
    report.push({
      status: "failed",
      project_gid: projectGid,
      task_gid: "",
      task_name: name,
      error: String(err.message || err)
    });

    console.log(`✖ failed: ${name}`);
  }
}

// Output JSON
fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), "utf8");

// Output CSV
const header = ["status", "project_gid", "task_gid", "task_name", "assignee_gid", "due_on", "error"].join(",");
const lines = report.map(x => [
  csvEscape(x.status),
  csvEscape(x.project_gid),
  csvEscape(x.task_gid),
  csvEscape(x.task_name),
  csvEscape(x.assignee_gid ?? ""),
  csvEscape(x.due_on ?? ""),
  csvEscape(x.error ?? "")
].join(","));

fs.writeFileSync(OUTPUT_CSV, [header, ...lines].join("\n"), "utf8");

console.log("\nListo ✅");
console.log("Output JSON:", OUTPUT_JSON);
console.log("Output CSV :", OUTPUT_CSV);
