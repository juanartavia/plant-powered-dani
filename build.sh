#!/bin/bash
set -e

echo "Building backend..."
pushd backend
#if node_modules doesn't exist, npm install
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run build
popd
echo "Backend built successfully!"
pushd frontend
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run build
popd
echo "Frontend built successfully!"
mkdir -p dist
rm -rf dist/*
cp backend/dist/* dist/
cp backend/templates/*.html dist/
cp frontend/dist/* dist/
cp appsscript.json dist/appsscript.json

echo "Build complete!"
