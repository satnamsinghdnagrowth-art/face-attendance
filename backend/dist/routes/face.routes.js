"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const face_controller_1 = require("../controllers/face.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const upload_middleware_1 = require("../middleware/upload.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.post('/register', upload_middleware_1.uploadFaceImage.single('image'), upload_middleware_1.handleMulterError, face_controller_1.registerFaceValidators, validate_middleware_1.validate, face_controller_1.registerFace);
router.post('/verify', face_controller_1.verifyFaceValidators, validate_middleware_1.validate, face_controller_1.verifyFace);
router.post('/liveness-check', face_controller_1.livenessCheck);
router.post('/admin/recompute-embeddings', role_middleware_1.requireAdmin, face_controller_1.recomputeEmbeddings);
router.get('/:userId/status', face_controller_1.getFaceStatus);
router.delete('/:userId', face_controller_1.deleteUserFace);
exports.default = router;
//# sourceMappingURL=face.routes.js.map