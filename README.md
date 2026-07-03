# ARCA FLAM - Duelo Biblico

App web para o duelo biblico da FLAM.

## Arquitetura

- GitHub Pages: frontend estatico React/Vite.
- Cloudflare Worker: API.
- Cloudflare D1: banco SQL do evento.

O GitHub Pages nao acessa D1 diretamente. Por isso o frontend usa `VITE_API_BASE_URL` para chamar o Worker.

## Desenvolvimento local

```bash
npm install
npm test
npm run build
npx wrangler d1 migrations apply arca-flam-duelo --local
npx wrangler dev --port 8787 --local
```

## Deploy

1. Crie o banco D1:

```bash
npx wrangler d1 create arca-flam-duelo
```

2. Copie o `database_id` retornado para `wrangler.toml`.
3. No GitHub, configure:
   - Repository variable `VITE_API_BASE_URL` com a URL do Worker.
   - Repository secret `CLOUDFLARE_API_TOKEN` com permissao para Workers e D1.
4. Rode o workflow `Deploy Cloudflare Worker`.
5. Ative GitHub Pages com source `GitHub Actions`.
6. Push na `main` publica o frontend.
