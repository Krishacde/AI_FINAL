import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(frontendRoot, "..");
const workspaceRoot = resolve(projectRoot, "..");
const pythonCandidates = process.platform === "win32"
  ? [join(projectRoot, ".venv", "Scripts", "python.exe"), join(workspaceRoot, ".venv", "Scripts", "python.exe")]
  : [join(projectRoot, ".venv", "bin", "python"), join(workspaceRoot, ".venv", "bin", "python")];
const python = process.env.PYTHON || pythonCandidates.find(existsSync) || (process.platform === "win32" ? "python" : "python3");
const vite = join(frontendRoot, "node_modules", "vite", "bin", "vite.js");
const backend = spawn(python, [join(projectRoot, "app.py")], { cwd: projectRoot, stdio: "inherit", env: process.env });
const client = spawn(process.execPath, [vite, "--host", "127.0.0.1"], { cwd: frontendRoot, stdio: "inherit", env: process.env });
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  backend.kill();
  client.kill();
  process.exitCode = code;
}

backend.on("error", (error) => { console.error(`Backend could not start: ${error.message}`); stop(1); });
client.on("error", (error) => { console.error(`Vite could not start: ${error.message}`); stop(1); });
backend.on("exit", (code) => { if (!stopping) stop(code || 0); });
client.on("exit", (code) => { if (!stopping) stop(code || 0); });
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
console.log("TripMate backend: http://127.0.0.1:8000");
console.log("TripMate React UI: http://127.0.0.1:5173");
