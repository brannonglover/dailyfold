import { readFileSync } from 'fs';
import path from 'path';

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('Missing DATABASE_URL. Set it in backend/.env before running db:migrate.');
  }

  const schemaPath = path.join(__dirname, '..', 'lib', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');

  const sql = postgres(url, { prepare: false, ssl: 'require', max: 1 });
  try {
    console.log('Applying backend/lib/schema.sql...');
    await sql.unsafe(schema);
    console.log('Schema applied successfully.');
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
