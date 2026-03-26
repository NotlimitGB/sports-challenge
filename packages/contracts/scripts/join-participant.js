import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const participant = new ethers.Wallet(
    process.env.PARTICIPANT_PRIVATE_KEY,
    provider,
  );

  const artifactPath = path.resolve(
    "artifacts/contracts/SportsChallenge.sol/SportsChallenge.json",
  );

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    artifact.abi,
    participant,
  );

  const depositAmount = await contract.depositAmount();

  console.log("Participant address:", participant.address);
  console.log("Deposit amount:", depositAmount.toString());

  const tx = await contract.joinChallenge({ value: depositAmount });
  await tx.wait();

  console.log("Participant joined on-chain");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
