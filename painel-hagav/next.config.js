/** @type {import('next').NextConfig} */
const path = require('path');

const publicSupabaseUrl = String(
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ''
).trim();

const publicSupabaseAnonKey = String(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },

  // Static export para hospedar em /admin no mesmo domínio
  output: 'export',
  trailingSlash: true,

  // O painel vive em hagav.com.br/admin
  basePath: '/admin',
  assetPrefix: '/admin',

  images: {
    unoptimized: true, // necessário para output: 'export'
  },

  // Garante injeção no client build mesmo quando o painel recebe envs sem prefixo NEXT_PUBLIC_.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: publicSupabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicSupabaseAnonKey,
  },

  webpack(config) {
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    return config;
  },
};

module.exports = nextConfig;
