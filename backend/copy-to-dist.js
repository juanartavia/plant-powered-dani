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

// El portal (frontend/) se compila aparte con vite build -> frontend/dist/index.html (single
// file, ver vite-plugin-singlefile). clasp push lee de la RAÍZ dist/ (rootDir en .clasp.json),
// no de frontend/dist/ -- sin este paso, "npm run build" en backend/ deja dist/index.html
// intacto con lo que hubiera ahí antes, y clasp push publica silenciosamente un portal viejo
// aunque el backend sí se haya actualizado (bug real encontrado el 7 ago: el fix de US-XX de
// sábados no se veía en el portal real porque nunca se copió el build del día). Falla fuerte
// si frontend/dist/index.html no existe en vez de copiar algo viejo o saltarse el paso — la
// causa más probable es correr el build de backend sin haber corrido antes el de frontend.
const frontendIndexHtml = path.join(__dirname, "..", "frontend", "dist", "index.html");
if (!fs.existsSync(frontendIndexHtml)) {
  throw new Error(
    `copy-to-dist: no existe ${frontendIndexHtml} -- corré "npm run build" en frontend/ ANTES de correr el build de backend/.`
  );
}
fs.copyFileSync(frontendIndexHtml, path.join(rootDist, "index.html"));

console.log("copy-to-dist: app.js + templates + index.html (frontend) copiados a " + rootDist);
