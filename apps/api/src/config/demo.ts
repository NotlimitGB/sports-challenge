import { ethers } from "ethers";

const LOCAL_TEST_PRIVATE_KEYS = [
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
];

export const DEMO_WALLETS = LOCAL_TEST_PRIVATE_KEYS.map((privateKey, index) => {
  const wallet = new ethers.Wallet(privateKey);

  return {
    label: `Demo Wallet ${index + 1}`,
    privateKey,
    address: wallet.address,
  };
});

export const DEMO_WALLET_ADDRESS =
  DEMO_WALLETS[0]?.address ?? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
export const OLD_DEMO_WALLET_ADDRESS = "0xTEST_WALLET";

export function pickUnusedDemoWallet(usedWalletAddresses: Iterable<string>) {
  const used = new Set(
    Array.from(usedWalletAddresses, (value) => value.trim().toLowerCase()),
  );

  return (
    DEMO_WALLETS.find(
      (wallet) => !used.has(wallet.address.trim().toLowerCase()),
    ) ?? null
  );
}

export function findDemoWalletByAddress(address: string | null | undefined) {
  if (!address) {
    return null;
  }

  const normalizedAddress = address.trim().toLowerCase();

  return (
    DEMO_WALLETS.find(
      (wallet) => wallet.address.trim().toLowerCase() === normalizedAddress,
    ) ?? null
  );
}
