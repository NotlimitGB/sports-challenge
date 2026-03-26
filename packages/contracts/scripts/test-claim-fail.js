import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { getAddress, getPrivateKey, getRequiredEnv } from "./env-utils.js";

async function main() {
  const provider = new ethers.JsonRpcProvider(getRequiredEnv("RPC_URL"));
  const participant = new ethers.Wallet(
    getPrivateKey("PARTICIPANT_PRIVATE_KEY"),
    provider,
  );

  const artifactPath = path.resolve(
    "artifacts/contracts/SportsChallenge.sol/SportsChallenge.json",
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const contract = new ethers.Contract(
    getAddress("CONTRACT_ADDRESS"),
    artifact.abi,
    participant,
  );

  try {
    const tx = await contract.claimReward();
    await tx.wait();
    console.log("Unexpected success");
  } catch (error) {
    console.log("claimReward failed as expected");
    console.log(String(error));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
