import { serve } from '@hono/node-server';

import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { loadRuntimeConfig } from './lib/config.js';
import { openDatabase } from './lib/database.js';

const config = loadRuntimeConfig();
const database = openDatabase(config.databasePath);
runMigrations(database);

serve(
  {
    fetch: createApp(database).fetch,
    port: config.port,
  },
  (info) => {
    console.log(
      `Discogs collection API listening on http://localhost:${info.port}`,
    );
  },
);
