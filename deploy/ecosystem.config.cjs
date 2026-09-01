const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'background-remover-api',
      cwd: path.join(__dirname, '..'),
      script: 'dist/server.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3014,
        PUBLIC_BASE_URL: 'http://bgremove.recipehubapi.com',
      },
    },
  ],
};
