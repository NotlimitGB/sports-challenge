import { prisma } from "../db/prisma.js";
import {
  DEMO_WALLET_ADDRESS,
  OLD_DEMO_WALLET_ADDRESS,
} from "../config/demo.js";

async function main() {
  const oldUser = await prisma.user.findUnique({
    where: { walletAddress: OLD_DEMO_WALLET_ADDRESS },
  });

  if (!oldUser) {
    console.log("Old demo user not found, nothing to rebind");
    return;
  }

  const existingNew = await prisma.user.findUnique({
    where: { walletAddress: DEMO_WALLET_ADDRESS },
  });

  if (existingNew) {
    console.log("New demo wallet already exists, stop to avoid conflict");
    return;
  }

  const updated = await prisma.user.update({
    where: { id: oldUser.id },
    data: { walletAddress: DEMO_WALLET_ADDRESS },
  });

  console.log("Wallet rebound:", updated.walletAddress);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
