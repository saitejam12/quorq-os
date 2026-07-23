import { postgres } from 'vite-plugin-neon-new'

// Dev-only convenience for the Cloudflare/Neon target: provisions a Neon dev
// branch and seeds it from db/init.sql. Only loaded when DEPLOY_TARGET=cloudflare
// (see vite.config.ts). The AWS target uses scripts/apply-schema.mjs instead.
export default postgres({
  seed: {
    type: 'sql-script',
    path: 'db/init.sql',
  },
  referrer: 'create-tanstack',
  dotEnvKey: 'DATABASE_URL',
})
