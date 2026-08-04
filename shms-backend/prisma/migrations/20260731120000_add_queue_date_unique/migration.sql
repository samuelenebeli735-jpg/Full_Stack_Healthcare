-- AlterTable
ALTER TABLE "Queue" ADD COLUMN "queueDate" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "Queue_organizationId_queueDate_queueNumber_key" ON "Queue"("organizationId", "queueDate", "queueNumber");
