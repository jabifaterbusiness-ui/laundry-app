import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/modules/permissions/permissions.catalog.js";

const prisma = new PrismaClient();

async function main() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        module: permission.module,
        action: permission.action,
        description: permission.description,
      },
      create: {
        code: permission.code,
        module: permission.module,
        action: permission.action,
        description: permission.description,
      },
    });
  }

  console.log(`Seeded ${PERMISSIONS.length} permissions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
