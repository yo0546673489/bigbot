# Travel Companion Client

A modern Next.js-based web application for managing travel services, drivers, and WhatsApp group communications.

## 🚀 Features

- **Modern React 19** with TypeScript
- **Next.js 15** with App Router
- **Tailwind CSS** for styling
- **Zustand** for state management
- **React Query** for server state management
- **Form handling** with React Hook Form and Zod validation
- **Authentication** with NextAuth.js
- **Responsive UI** with Radix UI components
- **WhatsApp integration** for group management
- **Real-time updates** and notifications

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── areas/            # Areas management
│   ├── dashboard/        # Main dashboard
│   ├── drivers/          # Driver management
│   ├── invites/          # Invitation system
│   ├── login/            # Authentication
│   ├── payments/         # Payment management
│   ├── profile/          # User profile
│   └── whatsapp-groups/  # WhatsApp group management
├── components/            # Reusable UI components
│   ├── areas/            # Area-specific components
│   ├── auth/             # Authentication components
│   ├── common/           # Shared components
│   ├── drivers/          # Driver-related components
│   ├── layout/           # Layout components
│   ├── profile/          # Profile components
│   ├── providers/        # Context providers
│   └── ui/               # Base UI components
├── lib/                   # Utility libraries
│   ├── api.ts            # API client configuration
│   └── utils.ts          # General utilities
├── services/              # API service layer
│   ├── areasService.ts   # Areas API service
│   ├── driverService.ts  # Driver API service
│   └── driversInvitesService.ts # Invites API service
├── store/                 # Zustand state stores
│   ├── areasStore.ts     # Areas state management
│   ├── authStore.ts      # Authentication state
│   └── driversInvites.ts # Invites state management
├── types/                 # TypeScript type definitions
└── utils/                 # Utility functions
    └── auth.ts           # Authentication utilities
```

## 🛠️ Tech Stack

### Core Framework
- **Next.js 15.3.3** - React framework with App Router
- **React 19** - UI library
- **TypeScript 5** - Type safety

### State Management
- **Zustand 5.0.6** - Lightweight state management
- **React Query 5.80.5** - Server state management

### UI & Styling
- **Tailwind CSS 4.1.8** - Utility-first CSS framework
- **Radix UI** - Accessible component primitives
- **Headless UI** - Unstyled, accessible components
- **Lucide React** - Icon library
- **Heroicons** - Additional icon set

### Forms & Validation
- **React Hook Form 7.57.0** - Form handling
- **Zod 3.25.50** - Schema validation
- **Hookform Resolvers** - Form validation integration

### Authentication
- **NextAuth.js 4.24.11** - Authentication framework
- **js-cookie** - Cookie management

### Data & API
- **Axios 1.9.0** - HTTP client
- **React Table 8.21.3** - Table component

### Utilities
- **Moment Timezone** - Date/time handling
- **Date-fns** - Modern date utilities
- **Lodash** - Utility functions
- **clsx** - Conditional CSS classes

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd app/client
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the client directory:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:7878/api
   NEXTAUTH_SECRET=your-secret-key
   NEXTAUTH_URL=http://localhost:3000
   ```

4. **Start development server**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📝 Available Scripts

- **`npm run dev`** - Start development server
- **`npm run build`** - Build for production
- **`npm run start`** - Start production server
- **`npm run lint`** - Run ESLint
- **`npm run start:prod`** - Start with PM2 process manager

## 🔧 Configuration

### Authentication
The app uses NextAuth.js with JWT strategy. Authentication tokens are stored in both localStorage and cookies for persistence.

### API Configuration
API calls are configured in `src/lib/api.ts` with Axios interceptors for authentication and error handling.

### State Management
- **Zustand stores** manage client-side state
- **React Query** handles server state with caching and synchronization

## 🎨 UI Components

### Component Library
The app uses a combination of:
- **Radix UI** primitives for accessibility
- **Custom components** built with Tailwind CSS
- **Responsive design** for mobile and desktop

### Styling
- **Tailwind CSS** for utility classes
- **CSS Modules** for component-specific styles
- **Responsive breakpoints** for mobile-first design

## 🔐 Authentication Flow

1. **Login** - User authenticates via NextAuth.js
2. **Token Storage** - JWT tokens stored in localStorage and cookies
3. **API Calls** - Axios interceptors automatically include auth headers
4. **Session Management** - Automatic token refresh and validation

## 📱 Responsive Design

The application is built with a mobile-first approach:
- **Mobile** - Optimized for small screens
- **Tablet** - Adaptive layouts for medium screens
- **Desktop** - Full-featured desktop experience

## 🧪 Development

### Code Quality
- **ESLint** for code linting
- **TypeScript** for type safety
- **Prettier** for code formatting

### Testing
- **Jest** for unit testing
- **React Testing Library** for component testing

## 🚀 Deployment

### Production Build
```bash
npm run build
npm run start
```

### PM2 Process Manager
```bash
npm run start:prod
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 📚 API Integration

The client integrates with the Travel Companion API server:
- **Base URL**: Configurable via environment variables
- **Authentication**: JWT-based with automatic token management
- **Error Handling**: Centralized error handling with user-friendly messages
- **Real-time Updates**: WebSocket integration for live data

## 🤝 Contributing

1. Follow the existing code style
2. Add TypeScript types for new features
3. Update documentation for API changes
4. Test on multiple screen sizes
5. Ensure accessibility compliance

## 📄 License

This project is proprietary software. All rights reserved.

## 🆘 Support

For technical support or questions:
- Check the API documentation
- Review the server logs
- Contact the development team
