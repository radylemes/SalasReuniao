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

Documentacao completa para integracao externa:

- [Guia de integracao](./docs/INTEGRATION.md)
- [OpenAPI (openapi.yaml)](./docs/openapi.yaml)
- Swagger UI: `http://localhost:3000/api/docs` (com o servidor em execucao)

Endpoints principais:

- `GET /health`
- `GET /api/ui-config` (publico)
- `GET /api/rooms` com `x-localidade`
- `POST /api/schedule` com `x-localidade`
- `POST /api/availability/preview` com `x-localidade`
- `POST /api/book` com `x-localidade`
- `GET /api/bookings` com `x-localidade`
- `GET /api/directory/users` com `x-localidade`
- `POST /api/bookings/:eventId/check-in` com `x-localidade`
- `DELETE /api/bookings/:eventId` com `x-localidade`
- `GET/PUT /api/rooms/:roomEmail/kiosk-settings` com `x-localidade`
