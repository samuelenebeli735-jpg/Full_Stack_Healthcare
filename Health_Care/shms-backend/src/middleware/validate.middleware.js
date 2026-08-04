import { ZodError } from "zod";

function replaceObject(target, parsed) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, parsed);
}

const validate = (schemas) => {
  return async (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }

      if (schemas.params) {
        replaceObject(req.params, await schemas.params.parseAsync(req.params));
      }

      if (schemas.query) {
        replaceObject(req.query, await schemas.query.parseAsync(req.query));
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        error.statusCode = 400;

        error.message = "Validation failed.";

        error.errors = error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
      }

      next(error);
    }
  };
};

export default validate;