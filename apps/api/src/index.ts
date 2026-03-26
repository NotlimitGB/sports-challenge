import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./db/prisma.js";
import authRouter from "./routes/auth.js";
import stravaRouter from "./routes/strava.js";
import challengeRouter from "./routes/challenge.js";
import demoRouter from "./routes/demo.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("API is running");
});

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "connected" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, db: "error" });
  }
});

app.use("/auth", authRouter);
app.use("/strava", stravaRouter);
app.use("/challenge", challengeRouter);
app.use("/demo", demoRouter);

const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
