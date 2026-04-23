import { serve } from '@hono/node-server';

import app from './index.js';
import { loadRuntimeConfig } from './lib/config.js';

const config = loadRuntimeConfig();

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
