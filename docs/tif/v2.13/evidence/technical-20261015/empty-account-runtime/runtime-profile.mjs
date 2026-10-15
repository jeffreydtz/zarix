import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
export function runtimeProfile() {
  const name=process.env.ZARIX_ACCEPTANCE_RUNTIME_PROFILE;
  assert.ok(['empty-core-closure'].includes(name),'Explicit closed acceptance profile required');
  const profiles=JSON.parse(readFileSync(new URL('./profiles.json',import.meta.url),'utf8'));
  return {name,...profiles[name]};
}
