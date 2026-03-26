import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { getPrivateKey, getRequiredEnv } from "./env-utils.js";

async function main() {
  const rpcUrl = getRequiredEnv("RPC_URL");
  const privateKey = getPrivateKey("PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const artifactPath = path.resolve(
    "artifacts/contracts/SportsChallenge.sol/SportsChallenge.json",
  );

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const depositAmount = ethers.parseEther("0.01");
  const verifierAddress = wallet.address;

  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet,
  );

  const contract = await factory.deploy(depositAmount, verifierAddress);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();

  console.log("Deployed to:", contractAddress);
  console.log("Organizer/verifier:", wallet.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
