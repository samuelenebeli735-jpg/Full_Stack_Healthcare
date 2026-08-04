import AppError from "../utils/AppError.js";

const tenantMiddleware = (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication required.", 401));
  }

  const organizationId =
    req.body?.organizationId ||
    req.params?.organizationId ||
    req.query?.organizationId;

  if (!organizationId) {
    return next();
  }

  if (
    req.user.role !== "super_admin" &&
    req.user.organizationId !== organizationId
  ) {
    return next(
      new AppError(
        "You do not have permission to access this organization's data.",
        403
      )
    );
  }

  next();
};

export default tenantMiddleware;
