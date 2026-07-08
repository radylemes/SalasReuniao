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
3. Para integracao de outro site no browser, configure `CORS_ALLOWED_ORIGINS` no `.env` do backend.

## Documentacao da API (integracao externa)

- **Guia de integracao:** [`backend/docs/INTEGRATION.md`](backend/docs/INTEGRATION.md) — CORS, autenticacao, fluxos e exemplos `fetch`/`curl`
- **Contrato OpenAPI:** [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml)
- **Swagger UI (interativo):** `http://localhost:3000/api/docs` (com o backend em execucao)

## Backend

```bash
cd backend
npm install
npm run dev
```

API sobe em `http://localhost:3000` com endpoints:

- `GET /health`
- `GET /api/ui-config` (publico)
- `GET /api/rooms` (header `x-localidade`)
- `POST /api/schedule` (header `x-localidade`)
- `POST /api/availability/preview` (header `x-localidade`)
- `POST /api/book` (header `x-localidade`)
- `GET /api/bookings` (header `x-localidade`)
- `GET /api/directory/users` (header `x-localidade`)
- `POST /api/bookings/:eventId/check-in` (header `x-localidade`)
- `DELETE /api/bookings/:eventId` (header `x-localidade`)
- `GET/PUT /api/rooms/:roomEmail/kiosk-settings` (header `x-localidade`)
- `GET /api/docs` — documentacao Swagger UI

Rotas de administracao (`x-admin-key`): ver [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml).

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

## Reuniões criadas no Outlook

Para que uma reunião agendada no Outlook apareça na lista de **Reservas** e permita cancelamento/check-in pela app:

1. Use o **Assistente de agendamento** (Scheduling Assistant) no Outlook.
2. Adicione a **sala como recurso** (mailbox da sala, ex. `sala@wtorre.com.br`), não apenas o nome da sala no campo *Local*.
3. Confirme que a sala pertence ao **mesmo tenant Microsoft 365** da localidade usada na app (`x-localidade`: `WTorre` ou `Allianz`).
4. Verifique se a reserva da sala foi **aceite** (resposta automática ou manual).

Reservas feitas só no calendário do organizador (sem convidar a mailbox da sala) podem marcar a sala como ocupada na grade, mas a app passa a exibi-las na lista de reservas ao fundir a ocupação do `getSchedule` com o calendário da sala. Para cancelar pela app, o evento precisa existir no calendário da sala ou no do organizador com ID Graph válido.

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
