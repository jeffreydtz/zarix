import{defineConfig}from'../../../../../../node_modules/vitest/dist/config.js';
import{fileURLToPath}from'node:url';const root=fileURLToPath(new URL('../../../../../../',import.meta.url));
export default defineConfig({root,cacheDir:'/tmp/zarix-cp124-native-worker/.vite',resolve:{alias:{'@':root}},test:{environment:'node',include:['docs/tif/v2.13/evidence/technical-20261015/empty-followup-contracts/worker-delivery.test-source.ts'],maxWorkers:1,pool:'forks',watch:false}});
