module.exports = {
  apps: [
    {
      name: 'server',
      script: 'dist/src/main.js',
      instances: '24',
      exec_mode: 'cluster',
      node_args: '--expose-gc --max-old-space-size=4096',
      watch: false,
      env: {
        NODE_ENV: 'production',
        TOTAL_INSTANCES: '24',
      },
    },
  ],
};