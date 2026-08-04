import { Router } from "express";

import authRoutes from "./auth.route.js";
import organizationRoutes from "./organization.route.js";
import profileRoutes from "./profile.route.js";
import medicalRecordRoutes from "./medical-record.route.js";
import departmentRoutes from "./department.route.js";
import positionRoutes from "./position.route.js";
import staffRoutes from "./staff.route.js";
import serviceRoutes from "./service.route.js";
import appointmentRoutes from "./appointment.route.js";
import queueRoutes from "./queue.route.js";
import scheduleRoutes from "./schedule.route.js";
import consultationRoutes from "./consultation.route.js";
import auditRoutes from "./audit.route.js";
import prescriptionRoutes from "./prescription.route.js";
import notificationRoutes from "./notification.route.js";
import dashboardRoutes from "./dashboard.route.js";
import reportRoutes from "./report.route.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| API Home
|--------------------------------------------------------------------------
*/

router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SHMS API v1",
  });
});

/*
|--------------------------------------------------------------------------
| Authentication Routes
|--------------------------------------------------------------------------
*/


router.use("/auth", authRoutes);

router.use("/organizations", organizationRoutes);

router.use("/profiles", profileRoutes);

router.use("/medical-records", medicalRecordRoutes);

router.use("/departments", departmentRoutes);

router.use("/positions", positionRoutes);

router.use("/staff", staffRoutes);

router.use("/services", serviceRoutes);

router.use("/appointments", appointmentRoutes);

router.use("/queues", queueRoutes);

router.use("/schedules", scheduleRoutes);

router.use("/consultations", consultationRoutes);

router.use("/audit", auditRoutes);

router.use("/prescriptions", prescriptionRoutes);

router.use("/notifications", notificationRoutes);

router.use("/dashboard", dashboardRoutes);

router.use("/reports", reportRoutes);

export default router;