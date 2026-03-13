# Salas de Reuniao (Microsoft 365 Multi-Tenant)

Aplicacao com backend `Node.js + Express + TypeScript` e frontend em `Angular` (`frontend`) para consulta de salas, disponibilidade e reserva via Microsoft Graph.

## Estrutura

- `backend`: API em arquitetura limpa (`domain`, `application`, `infrastructure`, `presentation`).
- `frontend`: frontend Angular oficial da aplicacao.

## Pre-requisitos

- Node.js 20+
- Aplicacoes Azure AD com permissoes para Microsoft Graph (app-only)

## Setup rapido

1. Copie `.env.example` para `.env` na raiz e ajuste os valores.
2. Configure os tenants via variaveis de ambiente:
   - `WTORRE_TENANT_ID`, `WTORRE_CLIENT_ID`, `WTORRE_CLIENT_SECRET`
   - `ALLIANZ_TENANT_ID`, `ALLIANZ_CLIENT_ID`, `ALLIANZ_CLIENT_SECRET`

## Backend

```bash
cd backend
npm install
npm run dev
```

API sobe em `http://localhost:3000` com endpoints:

- `GET /health`
- `GET /api/rooms` (header `x-localidade`)
- `POST /api/schedule` (header `x-localidade`)
- `POST /api/book` (header `x-localidade`)
- `GET /api/bookings` (header `x-localidade`)
- `DELETE /api/bookings/:eventId` (header `x-localidade`)

### Exemplo de payloads

`POST /api/schedule`

```json
{
  "rooms": ["sala-a@tenant.com", "sala-b@tenant.com"],
  "start": "2026-03-11T14:00:00Z",
  "end": "2026-03-11T15:00:00Z"
}
```

`POST /api/book`

```json
{
  "roomEmail": "sala-a@tenant.com",
  "title": "Reuniao de planejamento",
  "start": "2026-03-11T14:00:00Z",
  "end": "2026-03-11T15:00:00Z"
}
```

`GET /api/bookings`

```json
{
  "bookings": [
    {
      "eventId": "AAMkAGI2...",
      "roomEmail": "sala-a@tenant.com",
      "roomName": "Sala A",
      "title": "Reuniao de planejamento",
      "start": "2026-03-11T14:00:00.0000000",
      "end": "2026-03-11T15:00:00.0000000",
      "organizer": "Daniel Lemes"
    }
  ]
}
```

`DELETE /api/bookings/:eventId`

- Resposta `204 No Content` quando a reserva e cancelada com sucesso.

## Frontend (Angular)

```bash
cd frontend
npm install
npm start
```

Interface em `http://localhost:4200`.

O frontend Angular usa proxy local:

- `/api` -> `http://localhost:3000`
- `/health` -> `http://localhost:3000`

## Fluxo ponta a ponta para validar

1. Suba o backend (`npm run dev` em `backend`).
2. Suba o frontend Angular (`npm start` em `frontend`).
3. Valide:
   - carregamento de salas por localidade;
   - consulta de disponibilidade por data;
   - criacao de reserva;
   - listagem de reservas;
   - cancelamento de reserva.

## Scripts principais

- Backend: `dev`, `build`, `start`
- Frontend Angular (`frontend`): `start`, `build`, `test`
