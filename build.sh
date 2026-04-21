#!/bin/sh
# HAGAV Studio — build script para Cloudflare Pages
# Monta pasta dist/ limpa: site estático + painel /admin
# Output directory no Cloudflare: dist

set -e

# ─── 1. Pasta de saída limpa ──────────────────────────────────────────────────
rm -rf dist
mkdir -p dist

# ─── 2. Site público (arquivos estáticos do root) ─────────────────────────────
# HTML pages
cp -r *.html dist/ 2>/dev/null || true

# Assets, functions, imagens, configs
cp -r assets       dist/ 2>/dev/null || true
cp -r functions    dist/ 2>/dev/null || true
cp -r thumbnail    dist/ 2>/dev/null || true

# Cloudflare routing e headers
cp _headers        dist/ 2>/dev/null || true
cp _redirects      dist/ 2>/dev/null || true

# Templates de PDF (proposta + contrato)
cp -r templates     dist/ 2>/dev/null || true

# Manifests e favicons
cp site.webmanifest dist/ 2>/dev/null || true
cp *.png            dist/ 2>/dev/null || true
cp *.ico            dist/ 2>/dev/null || true

# ─── 3. Build do painel Next.js ──────────────────────────────────────────────
cd painel-hagav
npm ci
npm run build
# out/ contém o export estático limpo (sem cache, sem .next)
cd ..

# ─── 4. Copia export para dist/admin ─────────────────────────────────────────
mkdir -p dist/admin
cp -r painel-hagav/out/. dist/admin/

echo ""
echo "✓ Build concluído. Arquivos em dist/"
echo "  Site público: dist/"
echo "  Painel admin: dist/admin/"
