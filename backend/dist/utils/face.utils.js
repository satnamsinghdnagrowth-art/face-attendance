"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findBestMatch = exports.computeImageEmbedding = exports.validateEmbedding = exports.getFaceConfidence = exports.isFaceMatch = exports.normalizeEmbedding = exports.euclideanDistance = exports.cosineSimilarity = void 0;
const sharp_1 = __importDefault(require("sharp"));
const env_1 = __importDefault(require("../config/env"));
const cosineSimilarity = (a, b) => {
    if (a.length !== b.length) {
        throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
    }
    if (a.length === 0) {
        throw new Error('Cannot compute cosine similarity of empty vectors');
    }
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let i = 0; i < a.length; i++) {
        const ai = a[i];
        const bi = b[i];
        dotProduct += ai * bi;
        magnitudeA += ai * ai;
        magnitudeB += bi * bi;
    }
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
    }
    return dotProduct / (magnitudeA * magnitudeB);
};
exports.cosineSimilarity = cosineSimilarity;
const euclideanDistance = (a, b) => {
    if (a.length !== b.length) {
        throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
};
exports.euclideanDistance = euclideanDistance;
const normalizeEmbedding = (embedding) => {
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) {
        throw new Error('Cannot normalize a zero vector');
    }
    return embedding.map((val) => val / magnitude);
};
exports.normalizeEmbedding = normalizeEmbedding;
const isFaceMatch = (embedding1, embedding2, threshold = env_1.default.FACE_SIMILARITY_THRESHOLD) => {
    const normalized1 = (0, exports.normalizeEmbedding)(embedding1);
    const normalized2 = (0, exports.normalizeEmbedding)(embedding2);
    const similarity = (0, exports.cosineSimilarity)(normalized1, normalized2);
    return similarity >= threshold;
};
exports.isFaceMatch = isFaceMatch;
const getFaceConfidence = (embedding1, embedding2) => {
    const normalized1 = (0, exports.normalizeEmbedding)(embedding1);
    const normalized2 = (0, exports.normalizeEmbedding)(embedding2);
    const similarity = (0, exports.cosineSimilarity)(normalized1, normalized2);
    return Math.max(0, Math.min(1, similarity));
};
exports.getFaceConfidence = getFaceConfidence;
const validateEmbedding = (embedding) => {
    if (!Array.isArray(embedding)) {
        return { valid: false, error: 'Embedding must be an array' };
    }
    if (embedding.length === 0) {
        return { valid: false, error: 'Embedding cannot be empty' };
    }
    if (embedding.length < 32) {
        return { valid: false, error: `Embedding too short: ${embedding.length} dimensions` };
    }
    for (let i = 0; i < embedding.length; i++) {
        const val = embedding[i];
        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
            return { valid: false, error: `Invalid value at index ${i}: ${val}` };
        }
    }
    return { valid: true };
};
exports.validateEmbedding = validateEmbedding;
const computeImageEmbedding = async (imagePath) => {
    const metadata = await (0, sharp_1.default)(imagePath).metadata();
    const imgW = metadata.width ?? 640;
    const imgH = metadata.height ?? 640;
    const cropSize = Math.floor(Math.min(imgW, imgH) * 0.6);
    const left = Math.floor((imgW - cropSize) / 2);
    const top = Math.max(0, Math.floor((imgH - cropSize) / 3));
    const { data } = await (0, sharp_1.default)(imagePath)
        .extract({ left, top, width: cropSize, height: cropSize })
        .resize(16, 8, { fit: 'fill' })
        .grayscale()
        .normalize()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const pixels = Array.from(data);
    const n = pixels.length;
    const mean = pixels.reduce((s, v) => s + v, 0) / n;
    const variance = pixels.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    if (std < 1e-6) {
        return pixels.map((_, i) => (i - n / 2) / n);
    }
    return pixels.map((v) => (v - mean) / std);
};
exports.computeImageEmbedding = computeImageEmbedding;
const findBestMatch = (queryEmbedding, candidateEmbeddings, threshold = env_1.default.FACE_SIMILARITY_THRESHOLD) => {
    if (candidateEmbeddings.length === 0)
        return null;
    const normalizedQuery = (0, exports.normalizeEmbedding)(queryEmbedding);
    let bestIndex = -1;
    let bestSimilarity = -1;
    for (let i = 0; i < candidateEmbeddings.length; i++) {
        const candidate = candidateEmbeddings[i];
        if (!candidate || candidate.length === 0)
            continue;
        const normalizedCandidate = (0, exports.normalizeEmbedding)(candidate);
        const similarity = (0, exports.cosineSimilarity)(normalizedQuery, normalizedCandidate);
        if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestIndex = i;
        }
    }
    if (bestIndex === -1 || bestSimilarity < threshold) {
        return null;
    }
    return {
        index: bestIndex,
        confidence: Math.max(0, Math.min(1, bestSimilarity)),
    };
};
exports.findBestMatch = findBestMatch;
//# sourceMappingURL=face.utils.js.map