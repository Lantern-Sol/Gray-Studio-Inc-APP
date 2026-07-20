-- CreateTable
CREATE TABLE "PodOrderLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "previewId" TEXT,
    "scene" TEXT,
    "printFileUrl" TEXT,
    "podOrderId" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PodOrderLog_pkey" PRIMARY KEY ("id")
);
