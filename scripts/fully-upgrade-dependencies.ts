import { execSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const TMP_DIR = resolve(ROOT, "tmp");
const PACKAGE_JSON_PATH = resolve(ROOT, "package.json");
const PACKAGE_LOCK_PATH = resolve(ROOT, "package-lock.json");
const DEPS_FILE = resolve(TMP_DIR, "deps.txt");
const DEV_DEPS_FILE = resolve(TMP_DIR, "dev-deps.txt");

async function run(): Promise<void> {
  await mkdir(TMP_DIR, { recursive: true });

  const packageJsonContent = await readFile(PACKAGE_JSON_PATH, "utf-8");
  const packageJson = JSON.parse(packageJsonContent) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const dependencies = Object.keys(packageJson.dependencies ?? {});
  const devDependencies = Object.keys(packageJson.devDependencies ?? {});

  await writeFile(DEPS_FILE, dependencies.join("\n") + "\n", "utf-8");
  await writeFile(DEV_DEPS_FILE, devDependencies.join("\n") + "\n", "utf-8");

  delete packageJson.dependencies;
  delete packageJson.devDependencies;

  await writeFile(
    PACKAGE_JSON_PATH,
    JSON.stringify(packageJson, null, 2) + "\n",
    "utf-8"
  );

  await rm(PACKAGE_LOCK_PATH, { force: true });

  for (const dep of dependencies) {
    console.log(`Installing dependency: ${dep}`);
    execSync(`npm install ${dep}`, { cwd: ROOT, stdio: "inherit" });
  }

  for (const devDep of devDependencies) {
    console.log(`Installing devDependency: ${devDep}`);
    execSync(`npm install -D ${devDep}`, { cwd: ROOT, stdio: "inherit" });
  }

  console.log("Dependency upgrade complete.");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
