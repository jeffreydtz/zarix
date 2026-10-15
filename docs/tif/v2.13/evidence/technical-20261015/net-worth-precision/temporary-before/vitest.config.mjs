import {defineConfig} from "/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix/node_modules/vitest/dist/config.js";
export default defineConfig({
  "root": "/tmp/zarix-cp306-ssr-20261015",
  "cacheDir": "/tmp/zarix-cp306-ssr-20261015/.vite",
  "oxc": {
    "jsx": {
      "runtime": "automatic"
    }
  },
  "resolve": {
    "alias": {
      "@": "/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix",
      "react": "/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix/node_modules/react",
      "react-dom": "/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix/node_modules/react-dom",
      "vitest": "/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix/node_modules/vitest/dist/index.js"
    }
  },
  "test": {
    "environment": "node",
    "include": [
      "net-worth-money-regression.test.ts"
    ],
    "maxWorkers": 1,
    "pool": "forks",
    "watch": false
  }
});
