-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('draft', 'registration', 'active', 'verification', 'finalized', 'cancelled');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('joined', 'passed', 'failed', 'claimed', 'refunded');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "strava_athlete_id" BIGINT,
    "strava_firstname" TEXT,
    "strava_lastname" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strava_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strava_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "contract_address" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deposit_amount_wei" DECIMAL(78,0) NOT NULL,
    "required_sport_type" TEXT NOT NULL DEFAULT 'Run',
    "target_distance_meters" INTEGER NOT NULL,
    "min_moving_time_seconds" INTEGER NOT NULL DEFAULT 0,
    "registration_deadline" TIMESTAMP(3) NOT NULL,
    "challenge_start_at" TIMESTAMP(3) NOT NULL,
    "challenge_end_at" TIMESTAMP(3) NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'draft',
    "organizer_wallet_address" TEXT NOT NULL,
    "verifier_wallet_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_participants" (
    "id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_tx_hash" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_distance_meters" INTEGER NOT NULL DEFAULT 0,
    "total_moving_time_seconds" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'joined',
    "verified_at" TIMESTAMP(3),
    "onchain_result_submitted" BOOLEAN NOT NULL DEFAULT false,
    "claimed_tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strava_activities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "strava_activity_id" BIGINT NOT NULL,
    "name" TEXT,
    "sport_type" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "distance_meters" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "moving_time_seconds" INTEGER NOT NULL DEFAULT 0,
    "elapsed_time_seconds" INTEGER NOT NULL DEFAULT 0,
    "trainer" BOOLEAN,
    "commute" BOOLEAN,
    "manual" BOOLEAN,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strava_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_activity_links" (
    "id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "counted_distance_meters" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "counted_moving_time_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_activity_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "users_strava_athlete_id_key" ON "users"("strava_athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "strava_tokens_user_id_key" ON "strava_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_contract_address_key" ON "challenges"("contract_address");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_participants_challenge_id_user_id_key" ON "challenge_participants"("challenge_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "strava_activities_strava_activity_id_key" ON "strava_activities"("strava_activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_activity_links_challenge_id_activity_id_key" ON "challenge_activity_links"("challenge_id", "activity_id");

-- AddForeignKey
ALTER TABLE "strava_tokens" ADD CONSTRAINT "strava_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strava_activities" ADD CONSTRAINT "strava_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_activity_links" ADD CONSTRAINT "challenge_activity_links_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_activity_links" ADD CONSTRAINT "challenge_activity_links_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "challenge_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_activity_links" ADD CONSTRAINT "challenge_activity_links_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "strava_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
