import { ethers } from "ethers";

function normalizeEnvValue(name) {
  const rawValue = process.env[name];

  if (!rawValue) {
    throw new Error(`${name} is missing in .env`);
  }

  const trimmed = rawValue.trim();
  const unquoted = trimmed.replace(/^['"]|['"]$/g, "");

  if (!unquoted) {
    throw new Error(`${name} is empty in .env`);
  }

  return unquoted;
}

export function getRequiredEnv(name) {
  return normalizeEnvValue(name);
}

export function getPrivateKey(name) {
  const value = normalizeEnvValue(name);

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return `0x${value}`;
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return value;
  }

  if (ethers.isAddress(value)) {
    throw new Error(
      `${name} looks like an address, not a private key. Expected a 32-byte hex private key.`,
    );
  }

  throw new Error(
    `${name} must be a 32-byte hex private key (64 hex chars, optional 0x prefix).`,
  );
}

export function getAddress(name) {
  const value = normalizeEnvValue(name);

  if (!ethers.isAddress(value)) {
    throw new Error(`${name} must be a valid Ethereum address.`);
  }

  return value;
}
