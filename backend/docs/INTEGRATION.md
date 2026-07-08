# Guia de integração da API (sites externos)

Este guia descreve como consumir a API de Salas de Reunião a partir de **outro site ou aplicação**, fora do frontend Angular oficial.

## URLs base

| Ambiente | URL base da API | Health check |
|----------|-----------------|--------------|
| Desenvolvimento | `http://localhost:3000/api` | `http://localhost:3000/health` |
| Produção | `https://salas.allianzparque.com.br/api` | `https://salas.allianzparque.com.br/health` |

**Documentação interativa:** após subir o backend, aceda a `/api/docs` (Swagger UI).

**Contrato OpenAPI:** [`openapi.yaml`](./openapi.yaml)

---

## Pré-requisitos para integração no browser

### CORS

Chamadas `fetch` ou `XMLHttpRequest` a partir de outro domínio exigem que o servidor autorize a origem do seu site.

No `.env` do backend, configure:

```env
CORS_ALLOWED_ORIGINS=https://meusite.com.br,https://www.meusite.com.br
```

Reinicie o backend após alterar. Sem esta variável, o servidor aceita qualquer origem em desenvolvimento (com aviso no log), mas em produção deve restringir explicitamente.

### Rate limiting

A API aplica limite de **100 pedidos por 15 minutos** por IP em `/api/*`. Planeie cache ou debounce no seu site se fizer muitas consultas de agenda.

---

## Autenticação e multi-tenant

A API integra com Microsoft Graph usando credenciais **app-only** por tenant. O cliente identifica o tenant com a **localidade**.

### Header obrigatório (rotas tenant)

```http
x-localidade: WTorre
```

Valores típicos: `WTorre`, `Allianz` (configurados no servidor via variáveis `WTORRE_*` e `ALLIANZ_*`).

**Alternativa:** query string `?localidade=WTorre` (útil em links ou GET simples).

### Rotas públicas (sem localidade)

- `GET /health`
- `GET /api/ui-config`
- `GET /api/admin/ui-config`

### Rotas de administração

Exigem o header:

```http
x-admin-key: <valor de ADMIN_API_KEY no servidor>
```

Aplicável a `PUT /api/admin/ui-config`, `GET /api/admin/rooms`, upload/remoção de logos, etc.

---

## Formato de erros

Todas as respostas de erro seguem:

```json
{
  "code": "ROOM_CONFLICT",
  "message": "A sala selecionada não está disponível neste horário.",
  "details": null,
  "correlationId": "uuid-da-requisição"
}
```

| Código HTTP | Códigos comuns | Significado |
|-------------|----------------|-------------|
| 400 | `LOCALIDADE_REQUIRED`, `VALIDATION_ERROR`, `INVALID_RANGE` | Pedido inválido |
| 401 | `ADMIN_UNAUTHORIZED`, `INVALID_TOKEN` | Não autorizado |
| 404 | `TENANT_NOT_FOUND`, `BOOKING_NOT_FOUND` | Recurso não encontrado |
| 409 | `ROOM_CONFLICT`, `REQUESTER_CONFLICT`, `PARTICIPANT_CONFLICT`, `ALREADY_CHECKED_IN` | Conflito de negócio |
| 503 | `ADMIN_NOT_CONFIGURED` | Admin não configurado no servidor |

---

## Fluxo 1: Listar salas e consultar agenda

### 1. Listar salas

```bash
curl -s "http://localhost:3000/api/rooms" \
  -H "x-localidade: WTorre"
```

```javascript
const API = 'http://localhost:3000/api';
const LOCALIDADE = 'WTorre';

const { rooms } = await fetch(`${API}/rooms`, {
  headers: { 'x-localidade': LOCALIDADE },
}).then((r) => r.json());

console.log(rooms);
// [{ name: "Sala A", email: "sala-a@wtorre.com.br", capacity: 10 }, ...]
```

### 2. Consultar agenda do dia

```bash
curl -s -X POST "http://localhost:3000/api/schedule" \
  -H "Content-Type: application/json" \
  -H "x-localidade: WTorre" \
  -d '{
    "rooms": ["sala-a@wtorre.com.br"],
    "start": "2026-07-08T12:00:00.000Z",
    "end": "2026-07-08T21:00:00.000Z"
  }'
```

```javascript
const { schedule } = await fetch(`${API}/schedule`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-localidade': LOCALIDADE,
  },
  body: JSON.stringify({
    rooms: ['sala-a@wtorre.com.br'],
    start: '2026-07-08T12:00:00.000Z',
    end: '2026-07-08T21:00:00.000Z',
  }),
}).then((r) => r.json());

// schedule[0].isAvailable, schedule[0].scheduleItems
```

---

## Fluxo 2: Pré-visualizar disponibilidade e reservar

### 1. Preview antes de reservar

```bash
curl -s -X POST "http://localhost:3000/api/availability/preview" \
  -H "Content-Type: application/json" \
  -H "x-localidade: WTorre" \
  -d '{
    "roomEmail": "sala-a@wtorre.com.br",
    "participants": ["user@wtorre.com.br"],
    "start": "2026-07-08T15:00:00.000Z",
    "end": "2026-07-08T16:00:00.000Z"
  }'
```

### 2. Criar reserva

```bash
curl -s -X POST "http://localhost:3000/api/book" \
  -H "Content-Type: application/json" \
  -H "x-localidade: WTorre" \
  -d '{
    "roomEmail": "sala-a@wtorre.com.br",
    "title": "Reunião de planejamento",
    "start": "2026-07-08T15:00:00.000Z",
    "end": "2026-07-08T16:00:00.000Z",
    "requesterEmail": "user@wtorre.com.br",
    "participants": ["colega@wtorre.com.br"]
  }'
```

```javascript
async function bookRoom(payload) {
  const response = await fetch(`${API}/book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-localidade': LOCALIDADE,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Falha ao reservar');
  }

  return response.json(); // { localidade, eventId }
}

try {
  const result = await bookRoom({
    roomEmail: 'sala-a@wtorre.com.br',
    title: 'Reunião de planejamento',
    start: '2026-07-08T15:00:00.000Z',
    end: '2026-07-08T16:00:00.000Z',
    requesterEmail: 'user@wtorre.com.br',
    participants: ['colega@wtorre.com.br'],
  });
  console.log('Reserva criada:', result.eventId);
} catch (err) {
  console.error(err.message);
}
```

### Conflitos de agenda

| Flag | Comportamento |
|------|---------------|
| (padrão) | Bloqueia se sala, solicitante ou participante estiver ocupado |
| `allowRequesterConflict: true` | Permite reservar mesmo com o solicitante ocupado |
| `allowParticipantConflict: true` | Permite reservar mesmo com participante ocupado |
| Sala ocupada | **Sempre bloqueia** (HTTP 409, `ROOM_CONFLICT`) |

---

## Fluxo 3: Listar e cancelar reservas

### Listar reservas (próximos 30 dias por defeito)

```bash
curl -s "http://localhost:3000/api/bookings" \
  -H "x-localidade: WTorre"
```

Com intervalo explícito:

```bash
curl -s "http://localhost:3000/api/bookings?start=2026-07-01T00:00:00.000Z&end=2026-07-31T23:59:59.000Z" \
  -H "x-localidade: WTorre"
```

### Cancelar reserva

```bash
curl -s -X DELETE "http://localhost:3000/api/bookings/AAMkAGI2..." \
  -H "x-localidade: WTorre"
```

Parâmetros opcionais na query (`organizer`, `roomEmail`, `start`, `end`, `title`) ajudam a localizar o evento no Graph quando o cancelamento falha só com o `eventId`.

Resposta de sucesso: **204 No Content**.

---

## Fluxo 4: Check-in (tablet / kiosk)

```bash
curl -s -X POST "http://localhost:3000/api/bookings/AAMkAGI2.../check-in?roomEmail=sala-a@wtorre.com.br" \
  -H "x-localidade: WTorre"
```

Resposta de sucesso: **204 No Content**.

Erros comuns: `BOOKING_NOT_FOUND` (404), `ALREADY_CHECKED_IN` (409).

---

## Fluxo 5: Pesquisar utilizadores

```bash
curl -s "http://localhost:3000/api/directory/users?query=daniel" \
  -H "x-localidade: WTorre"
```

Mínimo 2 caracteres no parâmetro `query`.

---

## Helper reutilizável (JavaScript)

```javascript
function createSalasApiClient(baseUrl, localidade) {
  const api = baseUrl.replace(/\/$/, '');

  async function request(path, options = {}) {
    const headers = {
      'x-localidade': localidade,
      ...options.headers,
    };
    const response = await fetch(`${api}${path}`, { ...options, headers });

    if (response.status === 204) return null;

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body?.message ?? `HTTP ${response.status}`;
      throw new Error(message);
    }
    return body;
  }

  return {
    getRooms: () => request('/rooms'),
    getSchedule: (payload) =>
      request('/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    previewAvailability: (payload) =>
      request('/availability/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    book: (payload) =>
      request('/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    listBookings: (start, end) => {
      const params = new URLSearchParams();
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      const qs = params.toString();
      return request(`/bookings${qs ? `?${qs}` : ''}`);
    },
    cancelBooking: (eventId, query = {}) => {
      const params = new URLSearchParams(query);
      const qs = params.toString();
      return request(`/bookings/${encodeURIComponent(eventId)}${qs ? `?${qs}` : ''}`, {
        method: 'DELETE',
      });
    },
    searchUsers: (query) =>
      request(`/directory/users?query=${encodeURIComponent(query)}`),
  };
}

// Uso:
// const salas = createSalasApiClient('https://salas.allianzparque.com.br/api', 'WTorre');
// const { rooms } = await salas.getRooms();
```

---

## Logos e UI config

- `GET /api/ui-config` — abas, mapeamento domínio → localidade, ordem das salas.
- Logos carregados via admin ficam em `/api/logos/<ficheiro>` (servidos estaticamente).

---

## Integração server-side (sem CORS)

Se o seu site tiver backend próprio (Node, .NET, PHP, etc.), pode chamar a API **do servidor** em vez do browser. Nesse caso CORS não se aplica; use HTTPS em produção e proteja credenciais admin (`x-admin-key`) apenas no servidor.

---

## Checklist de integração

1. Confirmar `GET /health` responde `200`.
2. Adicionar origem do seu site em `CORS_ALLOWED_ORIGINS`.
3. Testar `GET /api/rooms` com `x-localidade` correto.
4. Implementar tratamento de erros usando `code` e `message`.
5. Validar fluxo completo: agenda → preview → reserva → listagem → cancelamento.
6. Consultar `/api/docs` para explorar todos os endpoints interativamente.
