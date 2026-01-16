import "dotenv/config";
import https from "https";

// ==================================================
// ENV
// ==================================================
const token = process.env.ASANA_TOKEN;
const workspaceGid = process.env.ASANA_WORKSPACE_GID;

if (!token) throw new Error("Falta ASANA_TOKEN en .env");
if (!workspaceGid) throw new Error("Falta ASANA_WORKSPACE_GID en .env");

// ==================================================
// CONFIG
// ==================================================
const PORTFOLIO_NAME = "SEO Mavesa";

// ==================================================
// HTTPS AGENT (SSL corporativo)
// ==================================================
const agent = new https.Agent({
  rejectUnauthorized: false
});

// ==================================================
// REQUEST BODY
// ==================================================
const payload = JSON.stringify({
  data: {
    name: PORTFOLIO_NAME,
    workspace: workspaceGid
  }
});

// ==================================================
// REQUEST
// ==================================================
const options = {
  hostname: "app.asana.com",
  path: "/api/1.0/portfolios",
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload)
  },
  agent
};

const req = https.request(options, (res) => {
  let data = "";

  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    const json = JSON.parse(data);

    if (res.statusCode < 200 || res.statusCode >= 300) {
      console.error("❌ Error creando portafolio");
      console.error(JSON.stringify(json, null, 2));
      process.exit(1);
    }

    console.log("✔ Portafolio creado");
    console.log("Nombre:", json.data.name);
    console.log("GID:", json.data.gid);
  });
});

req.on("error", (err) => {
  console.error("❌ Request error");
  console.error(err);
  process.exit(1);
});

req.write(payload);
req.end();
