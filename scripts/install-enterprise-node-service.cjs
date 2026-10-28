const path = require("node:path");
const fs = require("node:fs");
const { Service } = require("node-windows");

function createServiceOptions({ root = path.resolve(__dirname, ".."), port = 3450 } = {}) {
  const pythonExecutable = process.env.PYTHON_EXECUTABLE || process.env.PYTHON || "python";
  return {
    name: "DigitalEvidenceEnterprise",
    description: "Digital Evidence Enterprise",
    script: path.join(root, "scripts", "enterprise-supervisor.mjs"),
    scriptOptions: `--port ${port}`,
    workingDirectory: root,
    env: [
      { name: "PORT", value: String(port) },
      { name: "NEXT_DIST_DIR", value: "build-output-enterprise" },
      { name: "NODE_ENV", value: "production" },
      { name: "PYTHON_EXECUTABLE", value: pythonExecutable },
    ],
  };
}

function createService(options = {}) {
  return new Service(createServiceOptions(options));
}

function cleanupStaleDaemonArtifacts({ root = path.resolve(__dirname, "..") } = {}) {
  const daemonRoot = path.join(root, "scripts", "daemon");
  const serviceId = "digitalevidenceenterprise";
  const files = [
    path.join(daemonRoot, `${serviceId}.exe`),
    path.join(daemonRoot, `${serviceId}.exe.config`),
    path.join(daemonRoot, `${serviceId}.xml`),
  ];
  for (const file of files) fs.rmSync(file, { force: true });
  return files;
}

function install(options = {}) {
  cleanupStaleDaemonArtifacts(options);
  const service = createService(options);
  service.on("install", () => {
    console.log(`[enterprise-service] installed ${service.name}`);
    service.start();
  });
  service.on("start", () => {
    console.log(`[enterprise-service] started ${service.name}`);
  });
  service.on("alreadyinstalled", () => {
    console.log(`[enterprise-service] already installed ${service.name}`);
  });
  service.on("error", (error) => {
    console.error(`[enterprise-service] error: ${error?.message || error}`);
    process.exitCode = 1;
  });
  service.install();
}

function uninstall(options = {}) {
  const service = createService(options);
  service.on("uninstall", () => {
    console.log(`[enterprise-service] uninstalled ${service.name}`);
  });
  service.on("alreadyuninstalled", () => {
    console.log(`[enterprise-service] already uninstalled ${service.name}`);
  });
  service.on("error", (error) => {
    console.error(`[enterprise-service] error: ${error?.message || error}`);
    process.exitCode = 1;
  });
  service.uninstall();
}

if (require.main === module) {
  const action = process.argv[2] || "install";
  const options = { port: Number(process.env.ENTERPRISE_PORT || 3450) };
  if (action === "install") install(options);
  else if (action === "uninstall") uninstall(options);
  else {
    console.error(`Usage: node ${path.basename(__filename)} <install|uninstall>`);
    process.exitCode = 2;
  }
}

module.exports = { createServiceOptions, createService, cleanupStaleDaemonArtifacts, install, uninstall };
