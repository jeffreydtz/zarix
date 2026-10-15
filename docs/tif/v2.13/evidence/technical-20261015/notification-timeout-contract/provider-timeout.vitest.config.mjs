import {defineConfig} from '../../../../../../node_modules/vitest/dist/config.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../../../../',import.meta.url));
export default defineConfig({root,cacheDir:'/tmp/zarix-cp127-focal-20261015/.vite',resolve:{alias:{'@':root}},test:{environment:'node',include:['docs/tif/v2.13/evidence/technical-20261015/notification-timeout-contract/provider-timeout.test-source.ts'],exclude:['node_modules/**','.next/**'],maxWorkers:1,pool:'forks',watch:false}});
