# Travel Companion Server

A robust NestJS-based backend API for the Travel Companion application, featuring WhatsApp integration, driver management, and comprehensive travel services.

## 🚀 Features

- **NestJS 11** framework with TypeScript
- **WhatsApp Business API** integration via Baileys
- **MongoDB** database with Mongoose ODM
- **JWT Authentication** with Passport
- **Redis** for caching and session management
- **Elasticsearch** for advanced search capabilities
- **Swagger API** documentation
- **Queue management** with BullMQ
- **File uploads** and media handling
- **Real-time messaging** and notifications

## 📁 Project Structure

```
src/
├── app.module.ts              # Main application module
├── main.ts                    # Application bootstrap
├── areas/                     # Areas management
│   ├── areas.controller.ts    # Areas API endpoints
│   ├── areas.dto.ts          # Data transfer objects
│   ├── areas.module.ts       # Areas module configuration
│   ├── areas.service.ts      # Areas business logic
│   └── areas.schema.ts       # MongoDB schema
├── auth/                      # Authentication system
│   ├── auth.controller.ts     # Auth API endpoints
│   ├── auth.module.ts        # Auth module configuration
│   ├── auth.service.ts       # Authentication logic
│   ├── guards/               # Route guards
│   ├── strategies/            # Passport strategies
│   └── dto/                  # Auth DTOs
├── common/                    # Shared utilities
│   ├── constants.ts          # Application constants
│   ├── types.ts              # Common type definitions
│   ├── utils.ts              # Utility functions
│   ├── localization/         # Internationalization
│   └── shared/               # Shared modules
├── config/                    # Configuration files
├── dashboard/                 # Dashboard endpoints
├── database/                  # Database configuration
├── dispatcher/                # Dispatcher management
├── drivers/                   # Driver management
│   ├── dto/                  # Driver DTOs
│   ├── schemas/              # Driver schemas
│   ├── driver.controller.ts  # Driver API endpoints
│   ├── driver.service.ts     # Driver business logic
│   └── driver.module.ts      # Driver module
├── invitation/                # Invitation system
├── payment/                   # Payment processing
├── redis/                     # Redis configuration
├── rides/                     # Ride management
├── services/                  # WhatsApp messaging services
├── shared/                    # Shared services
│   └── elasticsearch/        # Elasticsearch integration
├── stations/                  # Station management
├── wabmgmt/                   # WhatsApp business management
├── waweb/                     # WhatsApp web integration
├── whatsapp-groups/           # WhatsApp group management
└── whatsappflow/              # WhatsApp flow automation
```

## 🛠️ Tech Stack

### Core Framework
- **NestJS 11.1.3** - Progressive Node.js framework
- **Node.js** - JavaScript runtime
- **TypeScript 5.1.3** - Type safety

### Database & Storage
- **MongoDB** - NoSQL database
- **Mongoose 8.0.3** - MongoDB ODM
- **Redis** - In-memory data store
- **Elasticsearch 8.18.2** - Search engine

### Authentication & Security
- **Passport** - Authentication middleware
- **JWT** - JSON Web Tokens
- **bcrypt** - Password hashing

### WhatsApp Integration
- **Baileys** - WhatsApp Web API library
- **WhatsApp Business API** - Official business integration

### API & Documentation
- **Swagger/OpenAPI** - API documentation
- **Validation** - Class-validator for DTOs
- **CORS** - Cross-origin resource sharing

### Queue & Background Jobs
- **BullMQ 5.56.4** - Redis-based job queue
- **ioredis 5.6.1** - Redis client

### Utilities & Libraries
- **Moment.js** - Date/time manipulation
- **Axios** - HTTP client
- **XLSX** - Excel file handling
- **Pino** - Logging library

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB 5.0+
- Redis 6.0+
- Elasticsearch 8.0+ (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd app/server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the server directory:
   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/travel-companion
   REDIS_URL=redis://localhost:6379
   
   # JWT
   JWT_SECRET=your-jwt-secret
   JWT_EXPIRES_IN=7d
   
   # WhatsApp
   WHATSAPP_SESSION_PATH=./auth_info
   
   # Server
   PORT=7878
   NODE_ENV=development
   
   # Elasticsearch (optional)
   ELASTICSEARCH_NODE=http://localhost:9200
   ```

4. **Start dependencies**
   ```bash
   # Start MongoDB
   mongod
   
   # Start Redis
   redis-server
   
   # Start Elasticsearch (optional)
   elasticsearch
   ```

5. **Start development server**
   ```bash
   npm run start:dev
   ```

6. **Access the application**
   - API: http://localhost:7878/api
   - Swagger Docs: http://localhost:7878/api

## 📝 Available Scripts

- **`npm run build`** - Build the application
- **`npm run start`** - Start production server
- **`npm run start:dev`** - Start development server with hot reload
- **`npm run start:debug`** - Start with debug mode
- **`npm run start:prod`** - Start with PM2 process manager
- **`npm run start:stag`** - Start staging environment
- **`npm run lint`** - Run ESLint
- **`npm run test`** - Run unit tests
- **`npm run test:watch`** - Run tests in watch mode
- **`npm run test:cov`** - Run tests with coverage
- **`npm run seed:drivers`** - Seed database with sample drivers

## 🔧 Configuration

### Database Configuration
MongoDB connection is configured in `src/database/database.module.ts` with connection pooling and error handling.

### Redis Configuration
Redis is used for session storage, caching, and job queues. Configuration is in `src/redis/redis.provider.ts`.

### WhatsApp Configuration
WhatsApp integration is configured through multiple modules:
- **wabmgmt** - Business account management
- **waweb** - Web client integration
- **whatsappflow** - Automated message flows

### Authentication
JWT-based authentication with configurable expiration times and refresh mechanisms.

## 📚 API Endpoints

### Core Modules
- **`/api/auth`** - Authentication endpoints
- **`/api/drivers`** - Driver management
- **`/api/areas`** - Geographic areas
- **`/api/payments`** - Payment processing
- **`/api/whatsapp-groups`** - WhatsApp group management

### Swagger Documentation
Comprehensive API documentation is available at `/api` endpoint with:
- Interactive API testing
- Request/response schemas
- Authentication requirements
- Example requests

## 🔐 Authentication & Authorization

### JWT Strategy
- **Access tokens** for API authentication
- **Refresh tokens** for token renewal
- **Route guards** for protected endpoints

### User Roles
- **Admin** - Full system access
- **Manager** - Limited administrative access
- **User** - Basic user access

## 💬 WhatsApp Integration

### Features
- **Group management** - Create, update, delete groups
- **Message broadcasting** - Send messages to multiple groups
- **Flow automation** - Automated response systems
- **Media handling** - File and image sharing

### Configuration
- **Session management** - Persistent WhatsApp sessions
- **Business API** - Official WhatsApp Business integration
- **Web client** - Alternative web-based client

## 🗄️ Database Schema

### Core Entities
- **Drivers** - Driver information and status
- **Areas** - Geographic service areas
- **Payments** - Transaction records
- **WhatsApp Groups** - Group configurations
- **Users** - System users and authentication

### Relationships
- Drivers belong to specific areas
- Payments are linked to drivers and users
- WhatsApp groups can target specific areas

## 📊 Monitoring & Logging

### Logging
- **Pino** for structured logging
- **Request logging** middleware
- **Error tracking** and reporting

### Performance
- **Memory management** with garbage collection
- **Connection pooling** for databases
- **Caching strategies** with Redis

## 🧪 Testing

### Test Structure
- **Unit tests** for individual services
- **Integration tests** for API endpoints
- **E2E tests** for complete workflows

### Running Tests
```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov

# E2E tests
npm run test:e2e
```

## 🚀 Deployment

### Production Build
```bash
npm run build
npm run start:prod
```

### PM2 Process Manager
```bash
npm run start:prod
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 7878
CMD ["npm", "run", "start:prod"]
```

### Environment Variables
Ensure all required environment variables are set in production:
- Database connection strings
- JWT secrets
- WhatsApp configuration
- External service API keys

## 🔒 Security Considerations

### API Security
- **Rate limiting** on endpoints
- **Input validation** with class-validator
- **CORS configuration** for client access
- **JWT token validation**

### Data Protection
- **Password hashing** with bcrypt
- **Sensitive data encryption**
- **Audit logging** for changes

## 📈 Performance Optimization

### Database Optimization
- **Indexing strategies** for MongoDB
- **Connection pooling** and management
- **Query optimization** and monitoring

### Caching Strategy
- **Redis caching** for frequently accessed data
- **In-memory caching** for static data
- **Cache invalidation** strategies

## 🆘 Troubleshooting

### Common Issues
1. **MongoDB connection** - Check connection string and network
2. **Redis connection** - Verify Redis server status
3. **WhatsApp sessions** - Clear session files if needed
4. **JWT tokens** - Verify secret and expiration settings

### Debug Mode
Enable debug mode for detailed logging:
```bash
npm run start:debug
```

## 🤝 Contributing

1. Follow NestJS coding standards
2. Add comprehensive tests for new features
3. Update API documentation
4. Follow the established module structure
5. Add proper error handling and validation

## 📄 License

This project is proprietary software. All rights reserved.

## 🆘 Support

For technical support:
- Check the application logs
- Review the Swagger documentation
- Contact the development team
- Check the troubleshooting section
