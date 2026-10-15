import {defineConfig} from '../../../../../../node_modules/vitest/dist/config.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../../../../',import.meta.url));
export default defineConfig({
 root,
 cacheDir:'/tmp/zarix-investment-display-focal-20261015/.vite',
 oxc:{jsx:{runtime:'automatic'}},
 resolve:{alias:{'@':root}},
 test:{
  environment:'node',
  include:['docs/tif/v2.13/evidence/technical-20261015/remaining-seven-contracts/investment-display.test-source.ts'],
  exclude:['node_modules/**','.next/**'],
  maxWorkers:1,pool:'forks',watch:false,
 },
});
