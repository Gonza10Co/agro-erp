import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' },
  });
  await prisma.role.upsert({
    where: { name: 'OPERARIO' },
    update: {},
    create: { name: 'OPERARIO' },
  });
  // Rol acotado para compartir con el cliente: ve solo demos 1-2 (gating en el front).
  const cliente = await prisma.role.upsert({
    where: { name: 'CLIENTE' },
    update: {},
    create: { name: 'CLIENTE' },
  });

  const passwordHash = await argon2.hash('admin123');
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash, roleId: admin.id },
  });

  const clienteHash = await argon2.hash('botas2026');
  await prisma.user.upsert({
    where: { username: 'cliente' },
    update: {},
    create: { username: 'cliente', passwordHash: clienteHash, roleId: cliente.id },
  });

  console.log('Seed completo: roles ADMIN/OPERARIO/CLIENTE + usuarios admin (admin123) y cliente (botas2026)');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
