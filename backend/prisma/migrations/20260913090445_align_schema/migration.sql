-- CreateTable
CREATE TABLE "ProblemExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "explanation" TEXT,
    CONSTRAINT "ProblemExample_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ParticipantStatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WorkstationAssignmentHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workstationId" TEXT NOT NULL,
    "pcNumber" TEXT NOT NULL,
    "participantId" TEXT,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScoreAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "round1Score" REAL NOT NULL,
    "round2Score" REAL NOT NULL,
    "manualAdjustments" REAL NOT NULL,
    "finalScore" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "reversedAt" DATETIME,
    "reversedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ContestSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SuddenDeathRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "participantIds" TEXT NOT NULL,
    "problemId" TEXT,
    "bonusPoints" REAL NOT NULL DEFAULT 0,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Evaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "round1Score" REAL NOT NULL DEFAULT 0,
    "round2Score" REAL NOT NULL DEFAULT 0,
    "manualAdjustments" REAL NOT NULL DEFAULT 0,
    "judgeComments" TEXT,
    "codeQuality" REAL NOT NULL DEFAULT 0,
    "logicClarity" REAL NOT NULL DEFAULT 0,
    "finalScore" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    CONSTRAINT "Evaluation_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Evaluation" ("finalScore", "id", "judgeComments", "manualAdjustments", "participantId", "round1Score", "round2Score", "updatedAt") SELECT "finalScore", "id", "judgeComments", "manualAdjustments", "participantId", "round1Score", "round2Score", "updatedAt" FROM "Evaluation";
DROP TABLE "Evaluation";
ALTER TABLE "new_Evaluation" RENAME TO "Evaluation";
CREATE UNIQUE INDEX "Evaluation_participantId_key" ON "Evaluation"("participantId");
CREATE TABLE "new_Round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lateEntryCutoffMinutes" INTEGER NOT NULL DEFAULT 10,
    "autoSubmitOnEnd" BOOLEAN NOT NULL DEFAULT true,
    "pausedAt" DATETIME
);
INSERT INTO "new_Round" ("duration", "endTime", "id", "name", "startTime", "status") SELECT "duration", "endTime", "id", "name", "startTime", "status" FROM "Round";
DROP TABLE "Round";
ALTER TABLE "new_Round" RENAME TO "Round";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "college" TEXT,
    "collegeId" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "collegeIdVerified" BOOLEAN NOT NULL DEFAULT false,
    "checkedInAt" DATETIME,
    "disqualificationReason" TEXT,
    "lockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("college", "collegeId", "createdAt", "email", "id", "name", "passwordHash", "phone", "role", "status", "updatedAt") SELECT "college", "collegeId", "createdAt", "email", "id", "name", "passwordHash", "phone", "role", "status", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ContestSetting_key_key" ON "ContestSetting"("key");
