export const successResponse = (
    res,
    data = null,
    message = "Request successful.",
    statusCode = 200
) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data
    });
};

export const errorResponse = (
    res,
    message = "Something went wrong.",
    errors = null,
    statusCode = 500
) => {
    return res.status(statusCode).json({
        success: false,
        message,
        errors
    });
};