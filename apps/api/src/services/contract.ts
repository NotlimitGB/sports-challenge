import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const artifactPath = path.resolve(
  __dirname,
  "../../../../packages/contracts/artifacts/contracts/SportsChallenge.sol/SportsChallenge.json",
);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

const rpcUrl = process.env.RPC_URL?.trim() ?? "";
const organizerPrivateKey = normalizePrivateKey(process.env.PRIVATE_KEY);
const contractAddress = process.env.CONTRACT_ADDRESS?.trim() ?? "";

const provider = rpcUrl ? new ethers.JsonRpcProvider(rpcUrl) : null;

function normalizePrivateKey(value: string | undefined) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return null;
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return `0x${trimmed}`;
  }

  return null;
}

function assertContractConfigured() {
  if (!provider) {
    throw new Error("RPC_URL is not configured");
  }

  if (!organizerPrivateKey) {
    throw new Error("PRIVATE_KEY is not configured");
  }

  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    throw new Error("CONTRACT_ADDRESS is not configured");
  }
}

function createContract(signerOrProvider: ethers.ContractRunner) {
  assertContractConfigured();

  return new ethers.Contract(contractAddress, artifact.abi, signerOrProvider);
}

function createOrganizerWallet() {
  assertContractConfigured();
  const nextPrivateKey = organizerPrivateKey!;
  const nextProvider = provider!;

  return new ethers.Wallet(nextPrivateKey, nextProvider);
}

function readParticipantState(rawValue: any) {
  if (!rawValue) {
    return {
      joined: false,
      verified: false,
      passed: false,
      claimed: false,
    };
  }

  return {
    joined: Boolean(rawValue.joined ?? rawValue[0]),
    verified: Boolean(rawValue.verified ?? rawValue[1]),
    passed: Boolean(rawValue.passed ?? rawValue[2]),
    claimed: Boolean(rawValue.claimed ?? rawValue[3]),
  };
}

export function isContractConfigured() {
  return Boolean(
    provider &&
      organizerPrivateKey &&
      contractAddress &&
      ethers.isAddress(contractAddress),
  );
}

export async function getContractStatus(participantAddress?: string | null) {
  if (!isContractConfigured()) {
    return {
      available: false,
      contractAddress: contractAddress || null,
      participantAddress: participantAddress ?? null,
      joined: false,
      verified: false,
      passed: false,
      claimed: false,
      participantCount: null,
      depositAmountWei: null,
      totalPoolWei: null,
      finalized: false,
      error:
        "Контракт не настроен. Нужны RPC_URL, PRIVATE_KEY и CONTRACT_ADDRESS.",
    };
  }

  const organizerWallet = createOrganizerWallet();
  const contract = createContract(organizerWallet);
  const hasParticipantAddress =
    typeof participantAddress === "string" && ethers.isAddress(participantAddress);

  const [
    participantCount,
    depositAmount,
    totalPool,
    finalized,
    participantStateRaw,
  ] = await Promise.all([
    contract.getParticipantsCount!(),
    contract.depositAmount!(),
    contract.totalPool!(),
    contract.finalized!(),
    hasParticipantAddress
      ? contract.participants!(participantAddress)
      : Promise.resolve(null),
  ]);
  const participantState = readParticipantState(participantStateRaw);

  return {
    available: true,
    contractAddress,
    participantAddress: hasParticipantAddress ? participantAddress : null,
    joined: participantState.joined,
    verified: participantState.verified,
    passed: participantState.passed,
    claimed: participantState.claimed,
    participantCount: Number(participantCount),
    depositAmountWei: depositAmount.toString(),
    totalPoolWei: totalPool.toString(),
    finalized: Boolean(finalized),
    error: null,
  };
}

export async function joinDemoParticipantOnChain(participantPrivateKey: string) {
  assertContractConfigured();

  const normalizedPrivateKey = normalizePrivateKey(participantPrivateKey);

  if (!normalizedPrivateKey) {
    throw new Error("Invalid demo participant private key");
  }

  const participantWallet = new ethers.Wallet(normalizedPrivateKey, provider);
  const contract = createContract(participantWallet);
  const depositAmount = await contract.depositAmount!();
  const tx = await contract.joinChallenge!({
    value: depositAmount,
  });
  const receipt = await tx.wait();

  return {
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
    participantAddress: participantWallet.address,
    depositAmountWei: depositAmount.toString(),
  };
}

export async function submitResultOnChain(
  participantAddress: string,
  passed: boolean,
) {
  const organizerWallet = createOrganizerWallet();
  const contract = createContract(organizerWallet);
  const tx = await contract.submitResult!(participantAddress, passed);
  const receipt = await tx.wait();

  return {
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
  };
}
