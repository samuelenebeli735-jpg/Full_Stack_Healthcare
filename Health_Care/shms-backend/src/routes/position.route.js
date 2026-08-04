import { Router } from "express";

import validate from "../middleware/validate.middleware.js";

import {
  createPositionSchema,
  organizationPositionSchema,
  updatePositionSchema,
  idParamSchema,
} from "../validations/position.validation.js";

import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";

import {
  createPosition,
  getPositions,
  getPosition,
  updatePosition,
  deletePosition,
} from "../controllers/position.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ body: createPositionSchema }),
  createPosition
);

router.get(
  "/organization/:organizationId",
  authenticate,
  authorize("staff", "admin", "super_admin"),
  validate({ params: organizationPositionSchema }),
  getPositions
);

router.get(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ params: idParamSchema }),
  getPosition
);

router.patch(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ params: idParamSchema, body: updatePositionSchema }),
  updatePosition
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin", "super_admin"),
  validate({ params: idParamSchema }),
  deletePosition
);

export default router;
