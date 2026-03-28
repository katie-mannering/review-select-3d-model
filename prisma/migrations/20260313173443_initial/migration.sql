-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('REQUESTED', 'AWAITING_IMAGE', 'PREPROCESSING_IMAGE', 'GENERATING_3D_MODEL', 'CUSTOMER_ACTION', 'POSTPROCESSING', 'MODEL_QA', 'QA_OK', 'QA_NOK', 'AWAITING_CHOICE', 'READY_FOR_PRINING', 'CANCELLED');

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
CREATE TABLE "ModelOrder" (
    "id" INTEGER NOT NULL,
    "shopify_cust_id" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "order_status" "OrderStatus" NOT NULL,
    "cusomer_action_message" TEXT,

    CONSTRAINT "ModelOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelOrderInputs" (
    "Id" INTEGER NOT NULL,
    "modelOrderId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "ModelOrderInputs_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "ModelGenerations" (
    "id" INTEGER NOT NULL,
    "modelOrderId" INTEGER NOT NULL,
    "selectedByCust" BOOLEAN NOT NULL DEFAULT false,
    "glbUrl" TEXT,
    "stlUrl" TEXT,
    "mf3Url" TEXT,

    CONSTRAINT "ModelGenerations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ModelOrderInputs" ADD CONSTRAINT "ModelOrderInputs_modelOrderId_fkey" FOREIGN KEY ("modelOrderId") REFERENCES "ModelOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelGenerations" ADD CONSTRAINT "ModelGenerations_modelOrderId_fkey" FOREIGN KEY ("modelOrderId") REFERENCES "ModelOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
