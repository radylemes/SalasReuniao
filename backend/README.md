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

## Configuracao de tenants via ambiente

Configure os tenants diretamente no `.env`:

- `WTORRE_TENANT_ID`, `WTORRE_CLIENT_ID`, `WTORRE_CLIENT_SECRET`
- `ALLIANZ_TENANT_ID`, `ALLIANZ_CLIENT_ID`, `ALLIANZ_CLIENT_SECRET`

## Rotas

- `GET /health`
- `GET /api/rooms` com `x-localidade`
- `POST /api/schedule` com `x-localidade`
- `POST /api/book` com `x-localidade`
