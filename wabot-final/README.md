# TravelCompanion

A comprehensive travel management system with WhatsApp integration, featuring a Next.js frontend, NestJS backend, and Go-based WhatsApp bot.

## Architecture

This project consists of three main components:

- **Client** - Next.js frontend application (Port 3000)
- **Server** - NestJS backend API (Port 7878) 
- **Wabot** - Go-based WhatsApp bot service (Port 7879)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **Go** (v1.24 or higher)
- **MongoDB** (v8 or higher)
- **Redis** (for caching and queues)
- **Kafka** (for message queuing - optional)

## Quick Start with Docker

The easiest way to get started is using Docker Compose:

```bash
# Clone the repository
git clone <repository-url>
cd TravelCompanion/app

# Start all services with Docker
docker-compose up -d

# Check if all services are running
docker-compose ps
```

This will start:
- Frontend at http://localhost:3000
- Backend at http://localhost:7878
- MongoDB at localhost:27017

## Manual Setup

### 1. Database Setup

Start MongoDB and Redis:

```bash
# Using Docker
docker run -d --name mongodb -p 27017:27017 mongo:8
docker run -d --name redis -p 6379:6379 redis:alpine

# Or using your local installation
mongod
redis-server
```

### 2. Backend (Server) Setup

```bash
cd server

# Install dependencies
npm install

# Build the application
npm run build

# Start in development mode
npm run start:dev

# Or start in production mode
npm run start:prod
```

The server will be available at http://localhost:7878

### 3. Frontend (Client) Setup

```bash
cd client

# Install dependencies
npm install

# Start development server
npm run dev

# Or build and start production
npm run build
npm run start
```

The client will be available at http://localhost:3000

### 4. WhatsApp Bot (Wabot) Setup

```bash
cd wabot

# Install Go dependencies
go mod tidy

# Copy environment configuration
cp env.example .env

# Edit the .env file with your configuration
# PORT=7879
# DB_PATH=./wabot.db
# LOG_LEVEL=info
# SERVER_URL=http://localhost:7878
# REDIS_URL=localhost:6379
# KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
# KAFKA_TOPIC_MESSAGES=whatsapp-messages
# KAFKA_CLIENT_ID=wabot

# Build the application
go build -o wabot_build

# Run the bot
./wabot_build
```

## Environment Configuration

### Server Environment Variables

Create a `.env` file in the `server` directory:

```env
NODE_ENV=development
PORT=7878
MONGO_URL=mongodb://localhost:27017/travelbot
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret
```

### Client Environment Variables

Create a `.env.local` file in the `client` directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:7878
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
```

### Wabot Environment Variables

The wabot uses the `env.example` file as a template. Copy it to `.env` and configure:

```env
PORT=7879
DB_PATH=./wabot.db
LOG_LEVEL=info
SERVER_URL=http://localhost:7878
REDIS_URL=localhost:6379
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
KAFKA_TOPIC_MESSAGES=whatsapp-messages
KAFKA_CLIENT_ID=wabot
```

## Development Scripts

### Server Scripts

```bash
cd server

# Development
npm run start:dev

# Production
npm run start:prod

# Build
npm run build

# Lint
npm run lint

# Test
npm run test
```

### Client Scripts

```bash
cd client

# Development
npm run dev

# Production
npm run start

# Build
npm run build

# Lint
npm run lint
```

### Wabot Scripts

```bash
cd wabot

# Build
go build -o wabot_build

# Run
./wabot_build

# Clean build
rm wabot_build
```

## Project Structure

```
app/
├── client/                 # Next.js frontend
│   ├── src/
│   │   ├── app/           # App router pages
│   │   ├── components/    # React components
│   │   ├── services/      # API services
│   │   ├── store/         # Zustand stores
│   │   └── types/         # TypeScript types
│   └── package.json
├── server/                 # NestJS backend
│   ├── src/
│   │   ├── areas/         # Areas management
│   │   ├── auth/          # Authentication
│   │   ├── drivers/       # Driver management
│   │   ├── payment/       # Payment processing
│   │   └── whatsapp-groups/ # WhatsApp integration
│   └── package.json
├── wabot/                  # Go WhatsApp bot
│   ├── bot/               # Bot logic
│   ├── handlers/          # Message handlers
│   ├── services/          # External services
│   └── main.go
└── docker-compose.yml     # Docker configuration
```

## API Documentation

Once the server is running, you can access the API documentation at:
- Swagger UI: http://localhost:7878/api

## Features

- **Driver Management** - Register and manage drivers
- **Area Management** - Define service areas
- **Payment Processing** - Handle payments and transactions
- **WhatsApp Integration** - Bot for group management
- **Real-time Updates** - Live data synchronization
- **Authentication** - JWT-based auth system

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3000, 7878, and 7879 are available
2. **Database connection**: Verify MongoDB is running and accessible
3. **Redis connection**: Ensure Redis is running for caching
4. **WhatsApp bot**: Check environment variables and server connectivity

### Logs

- Server logs: Check console output or PM2 logs
- Client logs: Browser developer tools
- Wabot logs: Console output with configured log level

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.