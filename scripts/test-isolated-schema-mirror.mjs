// Deterministic fresh-install schema mirror. No database connections or writes.
// --write regenerates supabase/schema.sql; default verifies committed mirror.
import fs from 'node:fs/promises';
import path from 'node:path';
import { root, bootstrapSources } from './lib/test-isolated-database.mjs';
const sources=await bootstrapSources();
const contents=`-- GENERATED fresh-install schema: reconstructed baseline + all migrations.\n-- Regenerate: node scripts/test-isolated-schema-mirror.mjs --write\n-- Empty isolated database only. Do not apply this concatenation to production.\n-- Existing deployments apply only outstanding timestamped migrations.\n\n`+
 sources.map(file=>`-- BEGIN ${file.path}\n-- SHA256 ${file.sha256}\n${file.sql.trimEnd()}\n-- END ${file.path}\n`).join('\n');
const target=path.join(root,'supabase/schema.sql');
if(process.argv.includes('--write')){await fs.writeFile(target,contents);console.log(`Generated ${sources.length}-source schema mirror.`);}
else {const actual=await fs.readFile(target,'utf8');if(actual!==contents){console.error('Schema mirror differs from baseline + ordered migrations. Run with --write after review.');process.exitCode=1;}else console.log(`Schema mirror verified against ${sources.length} sources.`);}
