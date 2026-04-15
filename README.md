# GennyAPI

## 🛠️ Overview

GennyAPI is the backend for [Genny.bot](https://genny.bot). It exposes a REST API for AI generation, Stripe payments, file handling (Zipline), agents, chats, tools (Composio-style integrations), support tickets, and user profiles.

## 🌐 Website

[https://genny.bot](https://genny.bot)

## ⭐ Features

- 🎨 **Playground** — Model listing, run history, run by id, run cost, create/delete runs, agent run status
- 💳 **Stripe** — Payment intents and confirmation
- 🤖 **Agents** — Prompt enhancement, model listing, CRUD for user agents, agent runs
- 💬 **Chats** — Chat CRUD, messages, streaming runs
- 🧰 **Tools** — Toolkit catalog, per-tool metadata, OAuth connection helpers
- 👤 **User** — Profile, API key, transactions, usage log, files, tags
- 🎫 **Support** — Tickets and replies
- 📎 **Zipline** — Registration, upload, user file delete, user get/update

## 📁 Project structure

```
src/
├── app/
│   ├── error.ts
│   ├── response.ts
│   └── router.ts
├── api-vendors/
│   └── wavespeed/
├── controllers/
│   ├── agents/
│   ├── playground/
│   ├── stripe/
│   ├── user/
│   ├── chats/
│   ├── tools/
│   ├── webhooks/
│   ├── zipline/
│   ├── brands/
│   ├── promotions/
│   └── support/
├── database/
│   ├── const.ts
│   ├── supabaseClient.ts
│   ├── types.ts
│   └── ...
├── middlewares/
├── shared/
└── index.ts
```

## 🔐 Authentication

Most routes use `authenticateUser`. Send:

```http
Authorization: Bearer <token>
```

## 📡 Endpoints

Base path is the API root (e.g. `https://<host>`). All paths below are appended to that root.

### ✅ Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Health check |

### 💳 Stripe

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/stripe/create-payment-intent` | Yes | Create payment intent |
| `POST` | `/stripe/confirm-payment` | Yes | Confirm payment and credit tokens |

### 🪝 Webhooks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/webhooks/wavespeed` | No | Wavespeed webhook callback |

### 🎨 Playground

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/playground/` | No | List playground models |
| `POST` | `/playground/cost` | Yes | Estimate run cost |
| `POST` | `/playground/run` | Yes | Create a playground run |
| `GET` | `/playground/runs` | Yes | List user run history |
| `GET` | `/playground/runs/models` | Yes | List models used in run history |
| `GET` | `/playground/models/recent` | Yes | List recent models for user |
| `GET` | `/playground/runs/:runId` | Yes | Get one run by id |
| `GET` | `/playground/runs/:runId/agent` | Yes | Agent-focused run status/details |
| `DELETE` | `/playground/runs/:runId` | Yes | Delete a run and related files |
| `POST` | `/playground/webhooks/wavespeed` | No | Wavespeed vendor callback |

### 📎 Zipline

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/zipline/auth/register` | No | Register Zipline user |
| `POST` | `/zipline/upload` | Yes | Multipart upload |
| `POST` | `/zipline/user/files/delete` | Yes | Delete a user file |
| `GET` | `/zipline/user/get` | Yes | Get Zipline user |
| `PATCH` | `/zipline/user/update` | Yes | Update Zipline user |

### 🤖 Agents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/agents` | No | List agent models |
| `POST` | `/agents/enhance/prompt` | Yes | Stream prompt enhancement |
| `POST` | `/agents/run` | Yes | Run an agent |

### 💬 Chats

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/chats` | Yes | List chats |
| `POST` | `/chats` | Yes | Create chat |
| `POST` | `/chats/run` | Yes | Run chat (streaming) |
| `GET` | `/chats/chat/:chat_id` | Yes | Get chat |
| `PATCH` | `/chats/chat/:chat_id` | Yes | Update chat |
| `DELETE` | `/chats/chat/:chat_id` | Yes | Delete chat |
| `GET` | `/chats/chat/:chat_id/messages` | Yes | List messages |
| `POST` | `/chats/chat/:chat_id/messages` | Yes | Create message |
| `GET` | `/chats/chat/:chat_id/messages/:message_id` | Yes | Get message |
| `DELETE` | `/chats/chat/:chat_id/messages/:message_id` | Yes | Delete message |

### 🧰 Tools (integrations catalog)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/tools/auth-configs` | Yes | OAuth / auth configs |
| `GET` | `/tools/connected-accounts` | Yes | List connected accounts |
| `POST` | `/tools/connected-accounts/link` | Yes | Create connect link |
| `DELETE` | `/tools/connected-accounts/:id` | Yes | Remove connected account |
| `GET` | `/tools/tools` | Yes | List tools |
| `GET` | `/tools/tools/:tool_slug` | Yes | Tool by slug |
| `GET` | `/tools/toolkits` | Yes | List toolkits |
| `GET` | `/tools/toolkits/categories` | Yes | Toolkit categories |
| `GET` | `/tools/toolkits/:slug` | Yes | Toolkit by slug |

### 👤 User

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/user/profile` | Yes | Profile row (`Authorization: Bearer` Supabase access token) |
| `PATCH` | `/user/profile` | Yes | Update profile (app JWT from `create-token`) |
| `POST` | `/user/create-user` | No | Create `user_profiles` row (e.g. after signup) |
| `POST` | `/user/create-token` | Yes | Mint app JWT (`Authorization: Bearer` Supabase access token) |
| `POST` | `/user/api-key` | Yes | Persist app JWT on profile (Supabase access token) |
| `GET` | `/user/transactions` | Yes | List transactions |
| `GET` | `/user/usage-log` | Yes | Usage log |

#### 📄 User files (`/user/files`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/user/files/by-path` | Yes | File by path |
| `GET` | `/user/files/` | Yes | List files |
| `POST` | `/user/files/upload` | Yes | Upload |
| `POST` | `/user/files/` | Yes | Create file record |
| `DELETE` | `/user/files/:fileId` | Yes | Delete file |
| `PATCH` | `/user/files/:fileId` | Yes | Update file |

#### 🏷️ User tags (`/user/tags`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/user/tags/files/:fileId` | Yes | Tags for file |
| `POST` | `/user/tags/file-links` | Yes | Add tag to file |
| `DELETE` | `/user/tags/file-links` | Yes | Remove tag from file |
| `GET` | `/user/tags/` | Yes | List tags |
| `POST` | `/user/tags/` | Yes | Create tag |
| `PATCH` | `/user/tags/:tagId` | Yes | Update tag |
| `DELETE` | `/user/tags/:tagId` | Yes | Delete tag |

### Brands & promotions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/brands/` | No | List brands |
| `GET` | `/promotions/` | No | Active promotions |

### 🎫 Support

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/support/` | Yes | List tickets |
| `POST` | `/support/` | Yes | Create ticket |
| `GET` | `/support/:ticketId` | Yes | Ticket detail |
| `POST` | `/support/:ticketId/replies` | Yes | Reply to ticket |

## 🔗 Integrations

| Integration | Role |
|-------------|------|
| 🖥️ [Coolify](https://coolify.io/) | Server management, deployments, CI/CD |
| 🔗 [Composio](https://composio.dev/) | Tooling and connectors for agents |
| ▲ [Vercel AI Gateway](https://vercel.com/ai-gateway) | Model routing for agents |
| 🗄️ [Supabase](https://supabase.com/) | Database and authentication |
| 💳 [Stripe](https://stripe.com/) | Payments |

## Tech stack

- 🟢 **Node.js** — Runtime
- 🚂 **Express** — HTTP API
- 🔷 **TypeScript**
- 🗄️ **Supabase** — Database and auth client
- 💳 **Stripe** — Payments
- 🤖 **OpenAI** — Prompt enhancement and related flows
- 📦 **axios**, **multer**, **fluent-ffmpeg**, **sharp**, **cors** — HTTP, uploads, media

## 📜 Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | ⚡ Dev server with nodemon |
| `npm run dev:watch` | 🔁 Alias of `dev` |
| `npm run build` | 📦 Compile TypeScript |
| `npm start` | 🚀 Run compiled output |
| `npm run lint` | 🔍 ESLint |
| `npm run lint:fix` | ✨ ESLint with fixes |
| `npm run format` | 📝 Prettier write |
| `npm run format:check` | ✔️ Prettier check |
| `npm run type-check` | 🔷 `tsc --noEmit` |
