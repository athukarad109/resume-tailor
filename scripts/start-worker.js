const path = require("path");
const { spawn } = require("child_process");

const workerDir = path.join(__dirname, "..", "services", "worker");
const isWin = process.platform === "win32";
const uvicorn = path.join(
  workerDir,
  ".venv",
  isWin ? "Scripts" : "bin",
  isWin ? "uvicorn.exe" : "uvicorn"
);

const child = spawn(uvicorn, ["app.main:app", "--reload", "--port", "8001"], {
  cwd: workerDir,
  stdio: "inherit",
  shell: isWin,
});

child.on("error", (err) => {
  console.error("Failed to start worker:", err.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
