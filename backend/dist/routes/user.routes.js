"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("../controllers/user.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const upload_middleware_1 = require("../middleware/upload.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/', role_middleware_1.requireTeacher, user_controller_1.listUsersValidators, validate_middleware_1.validate, user_controller_1.listUsers);
router.get('/:id', user_controller_1.getUserById);
router.put('/:id', user_controller_1.updateUserValidators, validate_middleware_1.validate, user_controller_1.updateUser);
router.delete('/:id', role_middleware_1.requireAdmin, user_controller_1.deleteUser);
router.patch('/:id/activate', role_middleware_1.requireAdmin, user_controller_1.activateUser);
router.post('/:id/photo', upload_middleware_1.uploadPhoto.single('photo'), upload_middleware_1.handleMulterError, user_controller_1.uploadUserPhoto);
router.get('/:id/attendance-summary', role_middleware_1.requireTeacher, user_controller_1.getStudentAttendanceSummary);
exports.default = router;
//# sourceMappingURL=user.routes.js.map