import "dotenv/config";
import { ethers, NonceManager } from "ethers";
import fs from "fs";
import path from "path";
import { getAddress, getPrivateKey, getRequiredEnv } from "./env-utils.js";

async function main() {
  const provider = new ethers.JsonRpcProvider(getRequiredEnv("RPC_URL"));

  const organizerBase = new ethers.Wallet(getPrivateKey("PRIVATE_KEY"), provider);
  const participantBase = new ethers.Wallet(
    getPrivateKey("PARTICIPANT_PRIVATE_KEY"),
    provider,
  );

  const organizer = new NonceManager(organizerBase);
  const participant = new NonceManager(participantBase);

  const artifactPath = path.resolve(
    "artifacts/contracts/SportsChallenge.sol/SportsChallenge.json",
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const organizerContract = new ethers.Contract(
    getAddress("CONTRACT_ADDRESS"),
    artifact.abi,
    organizer,
  );

  const participantContract = new ethers.Contract(
    getAddress("CONTRACT_ADDRESS"),
    artifact.abi,
    participant,
  );

  const depositAmount = await organizerContract.depositAmount();
  console.log("Deposit amount:", depositAmount.toString());

  console.log("Participant joins...");
  const joinTx = await participantContract.joinChallenge({
    value: depositAmount,
  });
  await joinTx.wait();

  console.log("Submit result = false...");
  const resultTx = await organizerContract.submitResult(
    await participant.getAddress(),
    false,
  );
  await resultTx.wait();

  console.log("Finalize challenge...");
  const finalizeTx = await organizerContract.finalizeChallenge();
  await finalizeTx.wait();

  const participantAddress = await participant.getAddress();
  const state = await organizerContract.participants(participantAddress);
  console.log("Participant state:", state);

  console.log("Test flow completed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
