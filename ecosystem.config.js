module.exports = {
  apps: [
    {
      name: 'waba-ai-engine',
      script: 'server.js',
      cwd: '/root/enterprise-waba-ai',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 5055
      }
    },
    {
      name: 'waba-tunnel',
      script: 'tunnel_runner.js',
      cwd: '/root/enterprise-waba-ai',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
