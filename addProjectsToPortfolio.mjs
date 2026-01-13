import "dotenv/config";
import fs from "fs";
import path from "path";
import { addProjectToPortfolio } from "./modules/asanaPortfolio.mjs";

// =====================
// RUTAS (variables)
// =====================
const INPUT_PATH = "./output/projects.created.json"; // output del generador de proyectos
const OUTPUT_DIR = "./output";
const OUTPUT_JSON = path.join(OUTPUT_DIR, "portfolio.added.json");

// =====================
// CONFIG (env)
// =====================
const token = process.env.ASANA_TOKEN;
const portfolioGid = process.env.ASANA_PORTFOLIO_GID;

if (!token) throw new Error("Falta ASANA_TOKEN en .env");
if (!portfolioGid) throw new Error("Falta ASANA_PORTFOLIO_GID en .env");

if (!fs.existsSync(INPUT_PATH)) {
  throw new Error(`No existe el input JSON: ${INPUT_PATH}`);
}
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// =====================
// MAIN
// =====================
const projects = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
const results = [];

for (const p of projects) {
  const projectGid = p.project_gid || p.gid;
  const name = p.name || "";

  if (!projectGid) {
    results.push({ name, status: "skipped", error: "missing project_gid", raw: p });
    continue;
  }

  try {
    console.log(`Agregando: ${name} (${projectGid})`);
    await addProjectToPortfolio({ token, portfolioGid, projectGid });
    results.push({ name, project_gid: projectGid, status: "added" });
    console.log("✔ added");
  } catch (e) {
    results.push({ name, project_gid: projectGid, status: "failed", error: String(e.message || e) });
    console.log("✖ failed");
  }
}

fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2), "utf8");
console.log(`Listo. Output: ${OUTPUT_JSON}`);
