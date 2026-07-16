-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortraitJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sourceUrl" TEXT,
    "sourceMime" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortraitJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortraitPreview" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "cleanUrl" TEXT NOT NULL,
    "watermarkedUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortraitPreview_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PortraitPreview" ADD CONSTRAINT "PortraitPreview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PortraitJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

