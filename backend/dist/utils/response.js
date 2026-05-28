"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaginationParams = exports.paginatedResponse = exports.serverErrorResponse = exports.conflictResponse = exports.notFoundResponse = exports.forbiddenResponse = exports.unauthorizedResponse = exports.errorResponse = exports.noContentResponse = exports.createdResponse = exports.successResponse = void 0;
const successResponse = (res, data, message, statusCode = 200) => {
    const response = {
        success: true,
        message: message || 'Success',
        data,
    };
    return res.status(statusCode).json(response);
};
exports.successResponse = successResponse;
const createdResponse = (res, data, message = 'Created successfully') => {
    return (0, exports.successResponse)(res, data, message, 201);
};
exports.createdResponse = createdResponse;
const noContentResponse = (res) => {
    return res.status(204).send();
};
exports.noContentResponse = noContentResponse;
const errorResponse = (res, message, statusCode = 400, errors) => {
    const response = {
        success: false,
        message,
        data: null,
        ...(errors && errors.length > 0 && { errors }),
    };
    return res.status(statusCode).json(response);
};
exports.errorResponse = errorResponse;
const unauthorizedResponse = (res, message = 'Unauthorized') => {
    return (0, exports.errorResponse)(res, message, 401);
};
exports.unauthorizedResponse = unauthorizedResponse;
const forbiddenResponse = (res, message = 'Forbidden: insufficient permissions') => {
    return (0, exports.errorResponse)(res, message, 403);
};
exports.forbiddenResponse = forbiddenResponse;
const notFoundResponse = (res, message = 'Resource not found') => {
    return (0, exports.errorResponse)(res, message, 404);
};
exports.notFoundResponse = notFoundResponse;
const conflictResponse = (res, message = 'Resource already exists') => {
    return (0, exports.errorResponse)(res, message, 409);
};
exports.conflictResponse = conflictResponse;
const serverErrorResponse = (res, message = 'Internal server error') => {
    return (0, exports.errorResponse)(res, message, 500);
};
exports.serverErrorResponse = serverErrorResponse;
const paginatedResponse = (res, data, total, page, limit, message = 'Success') => {
    const totalPages = Math.ceil(total / limit);
    const response = {
        success: true,
        message,
        data,
        meta: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
        },
    };
    return res.status(200).json(response);
};
exports.paginatedResponse = paginatedResponse;
const getPaginationParams = (query) => {
    const page = Math.max(1, parseInt(String(query['page'] || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(query['limit'] || '20'), 10)));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
};
exports.getPaginationParams = getPaginationParams;
//# sourceMappingURL=response.js.map