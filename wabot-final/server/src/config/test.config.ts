import { config } from 'dotenv';
import { join } from 'path';

// Load .env.test file
config({ path: join(__dirname, '../../.env.test') });

export const testConfig = {
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    businessId: process.env.WHATSAPP_BUSINESS_ID,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  },
  phone: {
    testDriver: process.env.TEST_DRIVER_PHONE,
    admin: process.env.ADMIN_PHONE,
  },
  mongodb: {
    uri: process.env.MONGODB_URI,
  },
  server: {
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
  },
}; 