#!/bin/bash
echo "Starting migrations..."
npm run db:deploy

echo "Migrations finished. Starting servers..."
node dist/worker.js &
node dist/index.js &
wait -n
