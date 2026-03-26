import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const organizer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const artifactPath = path.resolve(
    "artifacts/contracts/SportsChallenge.sol/SportsChallenge.json",
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    artifact.abi,
    organizer,
  );

  const participantAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  const depositAmount = await contract.depositAmount();
  const totalPool = await contract.totalPool();
  const winnersCount = await contract.winnersCount();
  const finalized = await contract.finalized();
  const state = await contract.participants(participantAddress);

  console.log("Contract:", process.env.CONTRACT_ADDRESS);
  console.log("Participant:", participantAddress);
  console.log("Deposit:", depositAmount.toString());
  console.log("Total pool:", totalPool.toString());
  console.log("Winners:", winnersCount.toString());
  console.log("Finalized:", finalized);
  console.log("State:", state);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
