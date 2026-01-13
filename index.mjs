import "dotenv/config";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { createProject } from "./modules/asanaProjects.mjs";

// =====================
// RUTAS (variables)
// =====================
const INPUT_PATH = "./input/projects.csv";          // <- cambia aquí si quieres
const OUTPUT_DIR = "./output";                      // <- cambia aquí si quieres
const OUTPUT_JSON = path.join(OUTPUT_DIR, "projects.created.json");
const OUTPUT_CSV  = path.join(OUTPUT_DIR, "projects.created.csv");

// =====================
// CONFIG (env)
// =====================
const config = {
  token: process.env.ASANA_TOKEN,
  workspaceGid: process.env.ASANA_WORKSPACE_GID,
  teamGid: process.env.ASANA_TEAM_GID
};

if (!config.token || !config.workspaceGid || !config.teamGid) {
  throw new Error("Faltan variables de entorno: ASANA_TOKEN, ASANA_WORKSPACE_GID, ASANA_TEAM_GID");
}

// =====================
// Helpers
// =====================
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function csvEscape(value) {
  const s = String(value ?? "");
  // Si contiene comas, saltos o comillas => encerrar en comillas y escapar comillas dobles
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

// 2) Crear proyectos
const created = [];
for (const row of rows) {
  console.log(`Creando proyecto: ${row.name}`);
  const result = await createProject(
    { name: row.name, notes: row.notes ?? "" },
    config
  );
  created.push({
    name: result.name,
    project_gid: result.project_gid,
    notes: row.notes ?? ""
  });
  console.log(`✔ Creado: ${result.project_gid}`);
}

// 3) Guardar JSON (útil para trazabilidad)
fs.writeFileSync(OUTPUT_JSON, JSON.stringify(created, null, 2), "utf8");

// 4) Guardar CSV (lo que pediste)
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
