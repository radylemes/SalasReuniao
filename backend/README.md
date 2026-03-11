# Backend - API de Salas (Express + TypeScript)

API para listar salas, consultar disponibilidade e reservar via Microsoft Graph com tenant dinamico por localidade.

## Executar localmente

```bash
npm install
npm run dev
```

## Build e start

```bash
npm run build
npm start
```

## Seed de tenants

```bash
npm run db:seed
```

## Rotas

- `GET /health`
- `GET /api/rooms` com `x-localidade`
- `POST /api/schedule` com `x-localidade`
- `POST /api/book` com `x-localidade`
