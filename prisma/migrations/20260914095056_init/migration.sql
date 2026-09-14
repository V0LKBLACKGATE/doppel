-- CreateTable
CREATE TABLE "CloneJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceUrl" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "niche" TEXT,
    "status" TEXT NOT NULL,
    "errorReason" TEXT,
    "brandProfile" TEXT,
    "colorPalette" TEXT,
    "copyChanges" TEXT,
    "logoSvg" TEXT,
    "previewPath" TEXT,
    "exportPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
