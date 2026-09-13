-- DropIndex
DROP INDEX "AuditLog_organizationId_idx";

-- AlterTable
ALTER TABLE "Queue" ALTER COLUMN "queueDate" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Appointment_organizationId_appointmentDate_idx" ON "Appointment"("organizationId", "appointmentDate");

-- CreateIndex
CREATE INDEX "Appointment_organizationId_status_idx" ON "Appointment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Appointment_organizationId_appointmentDate_status_idx" ON "Appointment"("organizationId", "appointmentDate", "status");

-- CreateIndex
CREATE INDEX "Appointment_staffId_appointmentDate_idx" ON "Appointment"("staffId", "appointmentDate");

-- CreateIndex
CREATE INDEX "Appointment_medicalRecordId_idx" ON "Appointment"("medicalRecordId");

-- CreateIndex
CREATE INDEX "Appointment_serviceId_idx" ON "Appointment"("serviceId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Consultation_consultationDate_idx" ON "Consultation"("consultationDate");

-- CreateIndex
CREATE INDEX "MedicalRecord_recordYear_idx" ON "MedicalRecord"("recordYear");

-- CreateIndex
CREATE INDEX "PrescriptionItem_prescriptionId_idx" ON "PrescriptionItem"("prescriptionId");

-- CreateIndex
CREATE INDEX "Queue_organizationId_status_idx" ON "Queue"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Staff_departmentId_idx" ON "Staff"("departmentId");

-- CreateIndex
CREATE INDEX "Staff_positionId_idx" ON "Staff"("positionId");

-- CreateIndex
CREATE INDEX "Staff_employmentStatus_idx" ON "Staff"("employmentStatus");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");
