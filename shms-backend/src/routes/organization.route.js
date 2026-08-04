import { Router } from "express";

import {
  createOrganization,
  getOrganizations,
  getOrganization,
  getActiveOrganizations,
  updateOrganization,
} from "../controllers/organization.controller.js";
import validate from "../middleware/validate.middleware.js";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  idParamSchema,
} from "../validations/organization.validation.js";
import authenticate from "../middleware/auth.middleware.js";
import authorize from "../middleware/role.middleware.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Organization Routes
|--------------------------------------------------------------------------
*/

router.get(
  "/active",
  getActiveOrganizations
);

router.post(
  "/",
  authenticate,
  authorize("super_admin"),
  validate({ body: createOrganizationSchema }),
  createOrganization
);

router.get(
  "/",
  authenticate,
  authorize("super_admin"),
  getOrganizations
);

router.get(
  "/:id",
  authenticate,
  authorize("super_admin"),
  validate({ params: idParamSchema }),
  getOrganization
);

router.patch(
  "/:id",
  authenticate,
  authorize("super_admin"),
  validate({ params: idParamSchema, body: updateOrganizationSchema }),
  updateOrganization
);

export default router;