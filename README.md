# GennyAPI

Backend API for [Genny.bot](https://genny.bot) - An AI-powered content generation platform.

GennyAPI provides a comprehensive REST API for handling AI content generation, payment processing, file management, and user authentication.

## 🌐 Website

Visit [https://genny.bot](https://genny.bot) to use the application.

## 🚀 Setup

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- PostgreSQL database (via Supabase)
- Stripe account (for payments)
- OpenAI API key (for prompt enhancement)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd gennyapi
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory:

```env
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
STRIPE_SECRET_KEY=your_stripe_secret_key
OPENAI_API_KEY=your_openai_api_key
```

4. Run in development mode:

```bash
npm run dev
```

5. Build for production:

```bash
npm run build
npm start
```

## 📚 API Endpoints

### Health Check

- `GET /health` - Health check endpoint
  - Returns server status and timestamp

### Stripe (Payment Processing)

- `POST /stripe/create-payment-intent` - Create a payment intent
  - Requires authentication
  - Body: `{ amount: number }`
- `POST /stripe/confirm-payment` - Confirm payment and add tokens
  - Requires authentication
  - Body: `{ paymentIntentId: string, amount: number }`

### Generations (AI Content Generation)

- `POST /generations/generate` - Generate AI content (images/videos)
  - Requires authentication
  - Body: `{ model_id: string, payload: object, tokensCost: number }`

### Webhooks

- `POST /webhooks/polling` - Webhook polling endpoint
  - Handles status updates for async operations

### Zipline (File Management)

- `POST /zipline/auth/register` - Register a new Zipline user
  - Body: `{ email: string, password: string, username: string }`

- `POST /zipline/upload` - Upload a file
  - Requires authentication
  - Multipart form data

- `POST /zipline/user/files/delete` - Delete a user file
  - Requires authentication
  - Body: `{ fileId: string }`

- `GET /zipline/user/get` - Get user information
  - Requires authentication

- `PATCH /zipline/user/update` - Update user information
  - Requires authentication
  - Body: `{ ...userFields }`

### Agents (AI Prompt Enhancement)

- `POST /agents/enhance/prompt` - Enhance a prompt using AI
  - Requires authentication
  - Body: `{ prompt: string, generationType: 'image' | 'video' }`
  - Returns: Streaming text response with enhanced prompt
  - Supports `prompt: 'random'` for random prompt generation

### User Management

- `POST /user/create-user` - Create a new user profile
  - Body: `{ user_id: string, zipline: object, username: string, email: string }`
  - Automatically applies NEWUSER promotion if available

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start development server with auto-reload (nodemon)
- `npm run dev:watch` - Same as `dev` (alias)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run compiled JavaScript (production)
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors automatically
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run type-check` - Type check without emitting files

### Project Structure

```
src/
├── controllers/        # Route handlers organized by feature
│   ├── agents/        # AI prompt enhancement
│   ├── generate/      # Content generation
│   ├── stripe/        # Payment processing
│   ├── user/          # User management
│   ├── webhooks/      # Webhook handlers
│   └── zipline/       # File management
├── middlewares/       # Express middlewares (auth, etc.)
├── utils/             # Utility functions
├── routes.ts          # Main router configuration
└── index.ts           # Application entry point
```

## 🔐 Authentication

Most endpoints require authentication via the `authenticateUser` middleware. The authentication token should be included in the request headers:

```
Authorization: Bearer <token>
```

## 🌍 Environment Variables

| Variable                    | Description               | Required           |
| --------------------------- | ------------------------- | ------------------ |
| `PORT`                      | Server port               | No (default: 3000) |
| `SUPABASE_URL`              | Supabase project URL      | Yes                |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes                |
| `STRIPE_SECRET_KEY`         | Stripe secret API key     | Yes                |
| `OPENAI_API_KEY`            | OpenAI API key            | Yes                |

## 📦 Dependencies

### Core

- **express** - Web framework
- **typescript** - Type safety
- **@supabase/supabase-js** - Database and auth
- **stripe** - Payment processing
- **openai** - AI prompt enhancement

### Utilities

- **axios** - HTTP client
- **multer** - File upload handling
- **fluent-ffmpeg** - Video processing
- **sharp** - Image processing
- **cors** - Cross-origin resource sharing
