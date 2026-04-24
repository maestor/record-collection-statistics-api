import { serve } from '@hono/node-server';

import { loadRuntimeConfig } from './lib/config.js';
import { getRuntimeApp } from './runtime.js';

const config = loadRuntimeConfig();
const app = await getRuntimeApp();

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(
      `Discogs collection API listening on http://localhost:${info.port}`,
    );
  },
);
