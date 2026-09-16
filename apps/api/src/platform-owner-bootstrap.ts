import { bootstrapPlatformOwner } from "./modules/platform/platform-owner-bootstrap.service.js";

const email = process.env.PLATFORM_OWNER_EMAIL;
const fullName = process.env.PLATFORM_OWNER_NAME;
const password = process.env.PLATFORM_OWNER_PASSWORD;

if (!email || !fullName || !password) {
  console.error(
    "Platform Owner bootstrap requires PLATFORM_OWNER_EMAIL, PLATFORM_OWNER_NAME, and PLATFORM_OWNER_PASSWORD.",
  );
  process.exit(1);
}

try {
  const user = await bootstrapPlatformOwner({
    email,
    fullName,
    password,
  });

  console.log(`Platform Owner created successfully: ${user.email}`);
  console.log("The bootstrap password was not displayed or stored in plaintext.");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Platform Owner bootstrap failed.",
  );
  process.exit(1);
}
