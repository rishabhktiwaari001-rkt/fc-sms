import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create the Lucknow Chowk store (matching the real portal)
  const store = await prisma.store.upsert({
    where: { code: 'LKO-CHOWK' },
    update: {},
    create: { name: 'FC @ Lucknow - Chowk', code: 'LKO-CHOWK', city: 'Lucknow' },
  });
  console.log(`✅  Store: ${store.name} (${store.id})`);

  // Super admin (no store restriction)
  const superAdminStore = await prisma.store.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { name: 'Admin HQ', code: 'ADMIN', city: 'Corporate' },
  });

  await prisma.user.upsert({
    where: { phone: '0000000000' },
    update: {},
    create: {
      phone: '0000000000',
      password: await bcrypt.hash('admin', 10),
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      storeId: superAdminStore.id,
    },
  });
  console.log('✅  Super admin: phone=0000000000 / password=admin');

  // Store Admin
  await prisma.user.upsert({
    where: { phone: 'admin' },
    update: {},
    create: {
      phone: 'admin',
      password: await bcrypt.hash('admin', 10),
      name: 'Store Admin',
      role: 'STORE_ADMIN',
      storeId: store.id,
    },
  });

  // Staff (matches prototype demo credentials)
  await prisma.user.upsert({
    where: { phone: '9140259050' },
    update: {},
    create: {
      phone: '9140259050',
      password: await bcrypt.hash('1234', 10),
      name: 'Aman Tiwari',
      role: 'STAFF',
      storeId: store.id,
    },
  });
  console.log('✅  Staff: phone=9140259050 / password=1234');

  console.log('🎉  Seed complete!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
