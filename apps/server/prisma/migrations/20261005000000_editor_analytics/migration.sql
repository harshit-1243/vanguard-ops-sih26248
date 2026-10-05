-- Course label on sessions (cross-course analytics) and DS-authored scenarios (scenario editor).
ALTER TABLE "Session" ADD COLUMN "course" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Session_status_idx" ON "Session"("status");

CREATE TABLE "CustomScenario" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scenario" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomScenario_pkey" PRIMARY KEY ("id")
);
