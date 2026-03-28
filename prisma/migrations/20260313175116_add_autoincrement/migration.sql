/*
  Warnings:

  - The primary key for the `ModelOrderInputs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `Id` on the `ModelOrderInputs` table. All the data in the column will be lost.

*/
-- AlterTable
CREATE SEQUENCE modelgenerations_id_seq;
ALTER TABLE "ModelGenerations" ALTER COLUMN "id" SET DEFAULT nextval('modelgenerations_id_seq');
ALTER SEQUENCE modelgenerations_id_seq OWNED BY "ModelGenerations"."id";

-- AlterTable
CREATE SEQUENCE modelorder_id_seq;
ALTER TABLE "ModelOrder" ALTER COLUMN "id" SET DEFAULT nextval('modelorder_id_seq');
ALTER SEQUENCE modelorder_id_seq OWNED BY "ModelOrder"."id";

-- AlterTable
ALTER TABLE "ModelOrderInputs" DROP CONSTRAINT "ModelOrderInputs_pkey",
DROP COLUMN "Id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "ModelOrderInputs_pkey" PRIMARY KEY ("id");
