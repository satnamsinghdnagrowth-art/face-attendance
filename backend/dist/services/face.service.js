"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.faceService = exports.FaceService = void 0;
const database_1 = require("../config/database");
const face_utils_1 = require("../utils/face.utils");
const error_middleware_1 = require("../middleware/error.middleware");
const env_1 = __importDefault(require("../config/env"));
const logger_1 = __importDefault(require("../utils/logger"));
class FaceService {
    async registerFaceEmbedding(userId, embedding, imageUrl) {
        const validation = (0, face_utils_1.validateEmbedding)(embedding);
        if (!validation.valid) {
            throw new error_middleware_1.CustomError(`Invalid embedding: ${validation.error}`, 400);
        }
        const userResult = await (0, database_1.query)('SELECT id FROM users WHERE id = $1 AND is_active = true', [userId]);
        if (userResult.rows.length === 0) {
            throw new error_middleware_1.NotFoundError('User');
        }
        const versionResult = await (0, database_1.query)('SELECT MAX(version) as max_version FROM face_embeddings WHERE user_id = $1', [userId]);
        const nextVersion = (versionResult.rows[0]?.max_version || 0) + 1;
        const embeddingArray = `{${embedding.join(',')}}`;
        await (0, database_1.query)(`INSERT INTO face_embeddings (user_id, embedding_vector, image_url, version, is_active)
       VALUES ($1, $2, $3, $4, true)`, [userId, embeddingArray, imageUrl, nextVersion]);
        logger_1.default.info('Face embedding registered', { userId, version: nextVersion });
    }
    async getUserEmbeddings(userId) {
        const result = await (0, database_1.query)(`SELECT id, user_id, embedding_vector, image_url, version, is_active, created_at
       FROM face_embeddings
       WHERE user_id = $1 AND is_active = true
       ORDER BY version DESC`, [userId]);
        return result.rows.map((row) => ({
            ...row,
            embedding_vector: Array.isArray(row.embedding_vector)
                ? row.embedding_vector
                : this.parseEmbeddingVector(row.embedding_vector),
        }));
    }
    parseEmbeddingVector(raw) {
        if (Array.isArray(raw))
            return raw;
        if (typeof raw === 'string') {
            return raw
                .replace(/^\{|\}$/g, '')
                .split(',')
                .map((v) => parseFloat(v.trim()));
        }
        return [];
    }
    async verifyFace(userId, incomingEmbedding) {
        const validation = (0, face_utils_1.validateEmbedding)(incomingEmbedding);
        if (!validation.valid) {
            throw new error_middleware_1.CustomError(`Invalid embedding: ${validation.error}`, 400);
        }
        const embeddings = await this.getUserEmbeddings(userId);
        if (embeddings.length === 0) {
            return { matched: false, confidence: 0 };
        }
        const normalizedIncoming = (0, face_utils_1.normalizeEmbedding)(incomingEmbedding);
        let bestSimilarity = -1;
        for (const stored of embeddings) {
            if (!stored.embedding_vector || stored.embedding_vector.length === 0)
                continue;
            const mag = Math.sqrt(stored.embedding_vector.reduce((s, v) => s + v * v, 0));
            if (mag === 0)
                continue;
            const normalizedStored = (0, face_utils_1.normalizeEmbedding)(stored.embedding_vector);
            const similarity = (0, face_utils_1.cosineSimilarity)(normalizedIncoming, normalizedStored);
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
            }
        }
        const confidence = Math.max(0, Math.min(1, bestSimilarity));
        const matched = confidence >= env_1.default.FACE_SIMILARITY_THRESHOLD;
        logger_1.default.debug('Face verification result', { userId, confidence, matched });
        return { matched, confidence };
    }
    async findMatchingStudent(classId, incomingEmbedding) {
        const validation = (0, face_utils_1.validateEmbedding)(incomingEmbedding);
        if (!validation.valid) {
            throw new error_middleware_1.CustomError(`Invalid embedding: ${validation.error}`, 400);
        }
        const magnitude = Math.sqrt(incomingEmbedding.reduce((sum, val) => sum + val * val, 0));
        if (magnitude === 0) {
            logger_1.default.debug('Zero embedding received — no face detected, skipping match');
            return null;
        }
        const result = await (0, database_1.query)(`SELECT fe.user_id, fe.embedding_vector,
              u.name, u.email, u.phone, u.role, u.photo_url, u.is_active,
              u.last_login, u.created_at
       FROM face_embeddings fe
       JOIN users u ON u.id = fe.user_id
       JOIN class_enrollments ce ON ce.student_id = fe.user_id
       WHERE ce.class_id = $1
         AND fe.is_active = true
         AND u.is_active = true
         AND u.role = 'student'`, [classId]);
        if (result.rows.length === 0) {
            logger_1.default.debug('No face embeddings found for class', { classId });
            return null;
        }
        const userEmbeddingsMap = new Map();
        for (const row of result.rows) {
            const embedding = this.parseEmbeddingVector(row.embedding_vector);
            const mag = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
            if (mag === 0)
                continue;
            const existing = userEmbeddingsMap.get(row.user_id);
            if (existing) {
                existing.embeddings.push(embedding);
            }
            else {
                userEmbeddingsMap.set(row.user_id, {
                    embeddings: [embedding],
                    userInfo: row,
                });
            }
        }
        const normalizedIncoming = (0, face_utils_1.normalizeEmbedding)(incomingEmbedding);
        let bestMatch = null;
        for (const [userId, { embeddings }] of userEmbeddingsMap) {
            const match = (0, face_utils_1.findBestMatch)(normalizedIncoming, embeddings, env_1.default.FACE_SIMILARITY_THRESHOLD);
            if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
                bestMatch = { userId, confidence: match.confidence };
            }
        }
        if (!bestMatch) {
            logger_1.default.debug('No matching student found', { classId });
            return null;
        }
        const userInfo = userEmbeddingsMap.get(bestMatch.userId).userInfo;
        const student = {
            id: userInfo.user_id,
            name: userInfo.name,
            email: userInfo.email,
            phone: userInfo.phone || undefined,
            role: userInfo.role,
            photo_url: userInfo.photo_url || undefined,
            is_active: userInfo.is_active,
            last_login: userInfo.last_login || undefined,
            created_at: userInfo.created_at,
        };
        logger_1.default.info('Student matched by face', {
            classId,
            studentId: bestMatch.userId,
            confidence: bestMatch.confidence,
        });
        return { student, confidence: bestMatch.confidence };
    }
    async deleteUserEmbeddings(userId) {
        const result = await (0, database_1.query)('DELETE FROM face_embeddings WHERE user_id = $1', [userId]);
        logger_1.default.info('Face embeddings deleted', { userId, count: result.rowCount });
    }
    async deactivateUserEmbeddings(userId) {
        await (0, database_1.query)('UPDATE face_embeddings SET is_active = false WHERE user_id = $1', [userId]);
        logger_1.default.info('Face embeddings deactivated', { userId });
    }
    async getFaceStats(userId) {
        const result = await (0, database_1.query)(`SELECT COUNT(*) as count, MAX(created_at) as last_updated
       FROM face_embeddings
       WHERE user_id = $1 AND is_active = true`, [userId]);
        const row = result.rows[0];
        const count = parseInt(row?.count || '0', 10);
        return {
            count,
            lastUpdated: row?.last_updated || null,
            isEnrolled: count > 0,
        };
    }
    async getEnrollmentStatus(userId) {
        const stats = await this.getFaceStats(userId);
        return {
            isEnrolled: stats.isEnrolled,
            embeddingCount: stats.count,
            lastUpdated: stats.lastUpdated,
        };
    }
}
exports.FaceService = FaceService;
exports.faceService = new FaceService();
exports.default = exports.faceService;
//# sourceMappingURL=face.service.js.map