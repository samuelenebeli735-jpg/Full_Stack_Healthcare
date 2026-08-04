import { errorResponse } from "../utils/apiResponse.js";

const notFoundMiddleware = (req, res) => {
    return errorResponse(
        res,
        "Route not found.",
        null,
        404
    );
};

export default notFoundMiddleware;