/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,

  // Static export para hospedar em /admin no mesmo domínio
  output: 'export',
  trailingSlash: true,

  // O painel vive em hagav.com.br/admin
  basePath: '/admin',
  assetPrefix: '/admin',

  images: {
    unoptimized: true, // necessário para output: 'export'
  },

  webpack(config) {
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    return config;
  },
};

module.exports = nextConfig;
