import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 対象ディレクトリ一覧
const targetDirs = [resolve(root, "workers"), resolve(root, "frontend")];

let generated = 0;

for (const dir of targetDirs) {
  const dirName = dir.split("/").pop();
  const files = readdirSync(dir).filter((f) => f.includes(".template."));

  for (const templateFile of files) {
    const outputFile = templateFile.replace(".template.", ".");
    const templatePath = resolve(dir, templateFile);
    const outputPath = resolve(dir, outputFile);

    const template = readFileSync(templatePath, "utf-8");

    const result = template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      const value = process.env[key];
      if (!value) {
        console.error(
          `Error: environment variable ${key} is not set (in ${dirName}/${templateFile})`,
        );
        process.exit(1);
      }
      return value;
    });

    writeFileSync(outputPath, result);
    console.log(`Generated ${dirName}/${outputFile}`);
    generated++;
  }
}

if (generated === 0) {
  console.error("Error: no template files found");
  process.exit(1);
}
