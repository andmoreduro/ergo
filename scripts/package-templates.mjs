import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

const templatesDir = path.resolve("src-tauri/resources/templates");

if (!fs.existsSync(templatesDir)) {
  console.error(`Templates directory not found: ${templatesDir}`);
  process.exit(1);
}

// Get all directories in the templates directory
const directories = fs.readdirSync(templatesDir).filter((file) => {
  const fullPath = path.join(templatesDir, file);
  return fs.statSync(fullPath).isDirectory();
});

for (const dir of directories) {
  const dirPath = path.join(templatesDir, dir);
  const zipPath = path.join(templatesDir, `${dir}.ergtemplate`);

  console.log(`Packaging template "${dir}" into "${zipPath}"...`);

  const zip = new AdmZip();

  // Add template.json
  const templateJsonPath = path.join(dirPath, "template.json");
  if (fs.existsSync(templateJsonPath)) {
    zip.addLocalFile(templateJsonPath);
  } else {
    console.warn(`Warning: template.json not found in ${dirPath}`);
    continue;
  }

  // Add locales directory if exists
  const localesPath = path.join(dirPath, "locales");
  if (fs.existsSync(localesPath) && fs.statSync(localesPath).isDirectory()) {
    zip.addLocalFolder(localesPath, "locales");
  }

  zip.writeZip(zipPath);
  console.log(`Successfully created ${zipPath}`);
}
