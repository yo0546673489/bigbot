import { Driver } from '../drivers/schemas/driver.schema';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { faker } from '@faker-js/faker/locale/en';
import { CATEGORY_BUTTONS_IDS, CLOTHING_BUTTONS_IDS } from '../common/constants';

async function seedDrivers() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const driverModel = app.get<Model<Driver>>(getModelToken(Driver.name));

  try {
    // Clear existing drivers
    await driverModel.deleteMany({});

    const drivers = Array.from({ length: 50 }, () => {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const name = `${firstName} ${lastName}`;
      const phone = `+84${faker.string.numeric(9)}`;
      const id = faker.string.numeric(9);
      const vehicleTypes = ['Toyota Camry', 'Honda Accord', 'Mercedes C-Class', 'BMW 3 Series'];

      return {
        name,
        phone,
        id,
        dob: faker.date.birthdate({ min: 25, max: 60, mode: 'age' }).toISOString().split('T')[0],
        category: faker.helpers.arrayElement(CATEGORY_BUTTONS_IDS),
        vehicle: faker.helpers.arrayElement(vehicleTypes),
        clothing: faker.helpers.arrayElement(CLOTHING_BUTTONS_IDS),
        isApproved: faker.datatype.boolean(),
        isActive: faker.datatype.boolean(),
        language: faker.helpers.arrayElement(['en', 'he'])
      };
    });

    await driverModel.insertMany(drivers);
    console.log('✅ Successfully seeded 50 drivers');
  } catch (error) {
    console.error('❌ Error seeding drivers:', error);
  } finally {
    await app.close();
  }
}

seedDrivers(); 