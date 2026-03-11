# Boilerplate Salas de Reuniao (Microsoft 365 Multi-Tenant)

Boilerplate inicial com backend `Node.js + Express + TypeScript` e frontend `Angular + Angular Material` para consulta de salas, disponibilidade e reserva via Microsoft Graph.

## Estrutura

- `backend`: API em arquitetura limpa (`domain`, `application`, `infrastructure`, `presentation`).
- `frontend`: dashboard Angular com seletor de localidade, cards de salas e formulario de reserva.

## Pre-requisitos

- Node.js 20+
- PostgreSQL 14+
- Aplicacoes Azure AD com permissoes para Microsoft Graph (app-only)

## Setup rapido

1. Copie `.env.example` para `.env` na raiz e ajuste os valores.
2. Crie banco PostgreSQL e execute:
   - `backend/src/infrastructure/db/schema.sql`
3. Rode seed de tenants:
   - `cd backend`
   - `npm run db:seed`

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

## Frontend

```bash
cd frontend
npm install
npm start
```

Interface em `http://localhost:4200`.

## Scripts principais

- Backend: `dev`, `build`, `start`, `db:seed`
- Frontend: `start`, `build`
