/**
 * PM2 config — paper mode.
 *
 * Env comes from the SHELL that runs `pm2 start` (source ~/.sentinel-env
 * first); nothing secret lives in this file or anywhere in the repo:
 *
 *   source ~/.sentinel-env && pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'sentinel',
      script: 'orchestrator/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 8000, // > the 2s persistence flush grace in shutdown()
      time: true,
    },
  ],
};
