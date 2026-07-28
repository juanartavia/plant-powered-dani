const fs = require("fs");
const path = require("path");

const rootDist = path.join(__dirname, "..", "dist");
fs.mkdirSync(rootDist, { recursive: true });

fs.copyFileSync(path.join(__dirname, "dist", "app.js"), path.join(rootDist, "app.js"));

const templatesDir = path.join(__dirname, "templates");
for (const file of fs.readdirSync(templatesDir)) {
  if (file.endsWith(".html")) {
    fs.copyFileSync(path.join(templatesDir, file), path.join(rootDist, file));
  }
}

console.log("copy-to-dist: app.js + templates copiados a " + rootDist);
