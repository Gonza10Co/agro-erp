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
  // Rol de PREPARACIÓN de demo: ve lo del cliente + la próxima entrega (módulos EN_STAGE).
  // Sirve para ensayar/mostrar la próxima demo en el mismo despliegue sin exponerla al cliente.
  const stage = await prisma.role.upsert({
    where: { name: 'STAGE' },
    update: {},
    create: { name: 'STAGE' },
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

  const stageHash = await argon2.hash('stage2026');
  await prisma.user.upsert({
    where: { username: 'stage' },
    update: {},
    create: { username: 'stage', passwordHash: stageHash, roleId: stage.id },
  });

  console.log(
    'Seed completo: roles ADMIN/OPERARIO/CLIENTE/STAGE + usuarios admin (admin123), cliente (botas2026) y stage (stage2026)',
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
