"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const response_1 = require("../utils/response");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/', async (req, res, next) => {
    try {
        const authReq = req;
        if (!authReq.user)
            throw new error_middleware_1.UnauthorizedError();
        const { limit = 50, unread } = req.query;
        (0, response_1.successResponse)(res, [], 'Notifications retrieved');
    }
    catch (error) {
        next(error);
    }
});
router.patch('/read-all', async (req, res, next) => {
    try {
        (0, response_1.successResponse)(res, { message: 'All notifications marked as read' }, 'Updated');
    }
    catch (error) {
        next(error);
    }
});
router.patch('/:id/read', async (req, res, next) => {
    try {
        (0, response_1.successResponse)(res, { message: 'Notification marked as read' }, 'Updated');
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=notification.routes.js.map