import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workersDir = resolve(root, "workers");

// workers/ 内の *.template.* ファイルを検索し、対応するファイルを生成
// 例: wrangler.template.toml → wrangler.toml, .dev.template.vars → .dev.vars
const files = readdirSync(workersDir).filter((f) => f.includes(".template."));

if (files.length === 0) {
  console.error("Error: no template files found in workers/");
  process.exit(1);
}

for (const templateFile of files) {
  const outputFile = templateFile.replace(".template.", ".");
  const templatePath = resolve(workersDir, templateFile);
  const outputPath = resolve(workersDir, outputFile);

  const template = readFileSync(templatePath, "utf-8");

  const result = template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = process.env[key];
    if (!value) {
      console.error(`Error: environment variable ${key} is not set (in ${templateFile})`);
      process.exit(1);
    }
    return value;
  });

  writeFileSync(outputPath, result);
  console.log(`Generated workers/${outputFile}`);
}
