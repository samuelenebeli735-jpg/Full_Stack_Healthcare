-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "chiefComplaint" TEXT,
    "symptoms" TEXT,
    "diagnosis" TEXT,
    "treatmentPlan" TEXT,
    "notes" TEXT,
    "consultationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_queueId_key" ON "Consultation"("queueId");

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
