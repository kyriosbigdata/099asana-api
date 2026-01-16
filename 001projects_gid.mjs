// createAndAssignProjects.mjs
import "dotenv/config";
import fs from "fs";
import path from "path";
import https from "https";
import { parse } from "csv-parse/sync";

// =====================
// RUTAS (variables)
// =====================
const INPUT_PATH  = "./input/projects.csv";          // <- cambia aquí si quieres
const OUTPUT_DIR  = "./output";                      // <- cambia aquí si quieres
const OUTPUT_JSON = path.join(OUTPUT_DIR, "projects.created.json");
const OUTPUT_CSV  = path.join(OUTPUT_DIR, "projects.created.csv");

// =====================
// CONFIG (env)
// =====================
const config = {
  token: process.env.ASANA_TOKEN,
  workspaceGid: process.env.ASANA_WORKSPACE_GID,
  teamGid: process.env.ASANA_TEAM_GID,
  portfolioGid: process.env.ASANA_PORTFOLIO_GID
};

if (!config.token || !config.workspaceGid || !config.teamGid || !config.portfolioGid) {
  throw new Error(
    "Faltan variables de entorno: ASANA_TOKEN, ASANA_WORKSPACE_GID, ASANA_TEAM_GID, ASANA_PORTFOLIO_GID"
  );
}

// =====================
// Helpers
// =====================
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// =====================
// ASANA: crear proyecto + asignar a portafolio (1 sola llamada)
// =====================
function createProjectAndAssign({ name, notes = "" }, cfg) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      data: {
        name,
        notes,
        workspace: cfg.workspaceGid,
        team: cfg.teamGid,

        // ✅ Asignación directa al portafolio (Opción A)
        memberships: [
          {
            resource_type: "portfolio",
            resource_id: cfg.portfolioGid
          }
        ]
      }
    });

    const req = https.request(
      {
        hostname: "app.asana.com",
        path: "/api/1.0/projects",
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },

        // ✅ VPN/SSL corporativo (self-signed cert)
        agent: new https.Agent({ rejectUnauthorized: false })
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }

          const json = JSON.parse(body);
          resolve({
            name: json.data.name,
            project_gid: json.data.gid
          });
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
ensureDir(OUTPUT_DIR);

// 1) Leer CSV input
if (!fs.existsSync(INPUT_PATH)) {
  throw new Error(`No existe el archivo input: ${INPUT_PATH}`);
}

const csvContent = fs.readFileSync(INPUT_PATH, "utf8");
const rows = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true
});

// Validación mínima
for (const [i, row] of rows.entries()) {
  if (!row.name) {
    throw new Error(`Fila ${i + 2} sin 'name' en ${INPUT_PATH} (recuerda que la fila 1 es header).`);
  }
}

// 2) Crear + asignar
const created = [];
for (const row of rows) {
  console.log(`Creando y asignando a portafolio: ${row.name}`);

  const result = await createProjectAndAssign(
    { name: row.name, notes: row.notes ?? "" },
    config
  );

  created.push({
    name: result.name,
    project_gid: result.project_gid,
    notes: row.notes ?? ""
  });

  console.log(`✔ Creado y asignado: ${result.project_gid}`);
}

// 3) Guardar JSON
fs.writeFileSync(OUTPUT_JSON, JSON.stringify(created, null, 2), "utf8");

// 4) Guardar CSV
const header = ["name", "project_gid", "notes"].join(",");
const lines = created.map(r => [
  csvEscape(r.name),
  csvEscape(r.project_gid),
  csvEscape(r.notes)
].join(","));

fs.writeFileSync(OUTPUT_CSV, [header, ...lines].join("\n"), "utf8");

console.log("Proceso finalizado ✅");
console.log(`Output JSON: ${OUTPUT_JSON}`);
console.log(`Output CSV : ${OUTPUT_CSV}`);
