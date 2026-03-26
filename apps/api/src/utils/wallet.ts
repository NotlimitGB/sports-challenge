export function getWalletAddressFromQuery(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("walletAddress is required");
  }

  const walletAddress = value.trim();

  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    throw new Error("Invalid wallet address");
  }

  return walletAddress;
}
