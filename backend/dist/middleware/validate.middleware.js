"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const express_validator_1 = require("express-validator");
const validate = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const validationErrors = errors.array().map((error) => ({
            field: error.type === 'field' ? error.path : 'unknown',
            message: error.msg,
            value: error.type === 'field' ? error.value : undefined,
        }));
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            data: null,
            errors: validationErrors,
        });
        return;
    }
    next();
};
exports.validate = validate;
exports.default = exports.validate;
//# sourceMappingURL=validate.middleware.js.map