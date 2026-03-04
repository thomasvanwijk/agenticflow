#!/bin/bash
set -e

echo "🚀 Installing Agenticflow CLI..."
cd cli
npm install
npm run build
npm link

echo "✅ CLI Installed!"
echo "Starting Setup Wizard..."
cd ..
agenticflow setup
