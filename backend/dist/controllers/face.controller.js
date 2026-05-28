"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recomputeEmbeddings = exports.livenessCheck = exports.getFaceStatus = exports.deleteUserFace = exports.verifyFace = exports.registerFace = exports.verifyFaceValidators = exports.registerFaceValidators = void 0;
const express_validator_1 = require("express-validator");
const face_service_1 = require("../services/face.service");
const storage_service_1 = require("../services/storage.service");
const face_utils_1 = require("../utils/face.utils");
const response_1 = require("../utils/response");
const error_middleware_1 = require("../middleware/error.middleware");
const logger_1 = __importDefault(require("../utils/logger"));
exports.registerFaceValidators = [
    (0, express_validator_1.body)('embedding')
        .notEmpty()
        .withMessage('Face embedding is required')
        .custom((value) => {
        let parsed;
        try {
            parsed = typeof value === 'string' ? JSON.parse(value) : value;
        }
        catch {
            throw new Error('Embedding must be valid JSON array');
        }
        const validation = (0, face_utils_1.validateEmbedding)(parsed);
        if (!validation.valid) {
            throw new Error(validation.error || 'Invalid embedding');
        }
        return true;
    }),
    (0, express_validator_1.body)('is_new_enrollment')
        .optional()
        .isIn(['true', 'false', true, false])
        .withMessage('is_new_enrollment must be boolean'),
];
exports.verifyFaceValidators = [
    (0, express_validator_1.body)('userId')
        .optional()
        .isUUID()
        .withMessage('Invalid user ID'),
    (0, express_validator_1.body)('embedding')
        .notEmpty()
        .withMessage('Face embedding is required'),
];
function computeLivenessScore(signals) {
    let score = 0;
    let factors = 0;
    if (signals.blinkDetected !== undefined) {
        score += signals.blinkDetected ? 0.3 : 0;
        factors++;
    }
    if (signals.headMovement !== undefined) {
        score += Math.min(1, signals.headMovement / 10) * 0.25;
        factors++;
    }
    if (signals.depthVariance !== undefined) {
        score += Math.min(1, signals.depthVariance) * 0.25;
        factors++;
    }
    if (signals.textureScore !== undefined) {
        score += Math.min(1, signals.textureScore) * 0.2;
        factors++;
    }
    if (factors === 0)
        return 0.3;
    return Math.min(1, score);
}
const registerFace = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { embedding: rawEmbedding, userId: targetUserId, is_new_enrollment } = req.body;
        const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
        const userId = isAdmin && targetUserId ? targetUserId : req.user.userId;
        if (!isAdmin && targetUserId && targetUserId !== req.user.userId) {
            throw new error_middleware_1.CustomError('You can only register your own face', 403);
        }
        let embedding;
        let imageUrl;
        if (req.file) {
            try {
                embedding = await (0, face_utils_1.computeImageEmbedding)(req.file.path);
            }
            catch (imgErr) {
                logger_1.default.warn('Image embedding computation failed, using client embedding', { error: imgErr });
                const raw = rawEmbedding;
                embedding = typeof raw === 'string' ? JSON.parse(raw) : raw;
            }
            imageUrl = await storage_service_1.storageService.saveFile(req.file, 'faces', {
                resize: { width: 640, height: 640 },
                quality: 90,
            });
        }
        else {
            embedding = typeof rawEmbedding === 'string'
                ? JSON.parse(rawEmbedding)
                : rawEmbedding;
            const validation = (0, face_utils_1.validateEmbedding)(embedding);
            if (!validation.valid) {
                (0, response_1.errorResponse)(res, validation.error || 'Invalid embedding', 400);
                return;
            }
        }
        const isFirstSample = is_new_enrollment === true || is_new_enrollment === 'true';
        if (isFirstSample) {
            await face_service_1.faceService.deactivateUserEmbeddings(userId);
        }
        await face_service_1.faceService.registerFaceEmbedding(userId, embedding, imageUrl);
        logger_1.default.info('Face registered', { userId, hasImage: !!imageUrl });
        (0, response_1.createdResponse)(res, { userId, hasImage: !!imageUrl, imageUrl }, 'Face embedding registered successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.registerFace = registerFace;
const verifyFace = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { userId: targetUserId, embedding: rawEmbedding } = req.body;
        const userId = targetUserId || req.user.userId;
        const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
        if (!isAdmin && userId !== req.user.userId) {
            throw new error_middleware_1.CustomError('Access denied', 403);
        }
        const embedding = typeof rawEmbedding === 'string'
            ? JSON.parse(rawEmbedding)
            : rawEmbedding;
        const validation = (0, face_utils_1.validateEmbedding)(embedding);
        if (!validation.valid) {
            (0, response_1.errorResponse)(res, validation.error || 'Invalid embedding', 400);
            return;
        }
        const result = await face_service_1.faceService.verifyFace(userId, embedding);
        (0, response_1.successResponse)(res, result, result.matched ? 'Face matched' : 'Face not matched');
    }
    catch (error) {
        next(error);
    }
};
exports.verifyFace = verifyFace;
const deleteUserFace = async (req, res, next) => {
    try {
        const { userId } = req.params;
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
        if (!isAdmin && req.user.userId !== userId) {
            throw new error_middleware_1.CustomError('You can only delete your own face data', 403);
        }
        await face_service_1.faceService.deleteUserEmbeddings(userId);
        (0, response_1.noContentResponse)(res);
    }
    catch (error) {
        next(error);
    }
};
exports.deleteUserFace = deleteUserFace;
const getFaceStatus = async (req, res, next) => {
    try {
        const { userId } = req.params;
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
        if (!isAdmin && req.user.userId !== userId) {
            throw new error_middleware_1.CustomError('Access denied', 403);
        }
        const status = await face_service_1.faceService.getEnrollmentStatus(userId);
        (0, response_1.successResponse)(res, status, 'Face enrollment status retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getFaceStatus = getFaceStatus;
const livenessCheck = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { blinkDetected, headMovement, depthVariance, textureScore, livenessScore: clientScore, } = req.body;
        const score = clientScore !== undefined
            ? clientScore
            : computeLivenessScore({ blinkDetected, headMovement, depthVariance, textureScore });
        const LIVENESS_THRESHOLD = 0.7;
        const isLive = score >= LIVENESS_THRESHOLD;
        logger_1.default.debug('Liveness check', { userId: req.user.userId, score, isLive });
        (0, response_1.successResponse)(res, { isLive, score, threshold: LIVENESS_THRESHOLD }, isLive ? 'Liveness check passed' : 'Liveness check failed');
    }
    catch (error) {
        next(error);
    }
};
exports.livenessCheck = livenessCheck;
const recomputeEmbeddings = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
        if (!isAdmin) {
            throw new error_middleware_1.CustomError('Admin access required', 403);
        }
        const { query: dbQuery } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
        const result = await dbQuery(`SELECT id, user_id, image_url
       FROM face_embeddings
       WHERE is_active = true AND image_url IS NOT NULL`);
        const uploadBase = process.env['UPLOAD_DIR'] || './uploads';
        const absoluteBase = path.default.isAbsolute(uploadBase)
            ? uploadBase
            : path.default.join(process.cwd(), uploadBase);
        let updated = 0;
        let failed = 0;
        const errors = [];
        for (const row of result.rows) {
            const relativePath = row.image_url.startsWith('/uploads/')
                ? row.image_url.slice('/uploads/'.length)
                : row.image_url;
            const absolutePath = path.default.join(absoluteBase, relativePath);
            if (!fs.default.existsSync(absolutePath)) {
                errors.push(`Image not found: ${absolutePath}`);
                failed++;
                continue;
            }
            try {
                const newEmbedding = await (0, face_utils_1.computeImageEmbedding)(absolutePath);
                const embeddingArray = `{${newEmbedding.join(',')}}`;
                await dbQuery('UPDATE face_embeddings SET embedding_vector = $1 WHERE id = $2', [embeddingArray, row.id]);
                updated++;
            }
            catch (err) {
                errors.push(`Failed for embedding ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
                failed++;
            }
        }
        logger_1.default.info('Face embeddings recomputed', { updated, failed, requestedBy: req.user.userId });
        (0, response_1.successResponse)(res, {
            total: result.rows.length,
            updated,
            failed,
            errors: errors.slice(0, 10),
        }, `Recomputed ${updated} embeddings. ${failed} failed.`);
    }
    catch (error) {
        next(error);
    }
};
exports.recomputeEmbeddings = recomputeEmbeddings;
//# sourceMappingURL=face.controller.js.map