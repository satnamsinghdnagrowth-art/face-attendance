"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFilePublicUrl = exports.handleMulterError = exports.uploadInMemory = exports.uploadAttendanceImage = exports.uploadFaceImage = exports.uploadPhoto = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const env_1 = __importDefault(require("../config/env"));
const response_1 = require("../utils/response");
const logger_1 = __importDefault(require("../utils/logger"));
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const ensureDir = (dirPath) => {
    if (!fs_1.default.existsSync(dirPath)) {
        fs_1.default.mkdirSync(dirPath, { recursive: true });
        logger_1.default.info(`Created upload directory: ${dirPath}`);
    }
};
const getUploadBase = () => {
    return path_1.default.isAbsolute(env_1.default.UPLOAD_DIR)
        ? env_1.default.UPLOAD_DIR
        : path_1.default.join(process.cwd(), env_1.default.UPLOAD_DIR);
};
const createStorage = (subfolder) => {
    return multer_1.default.diskStorage({
        destination: (_req, _file, cb) => {
            const uploadPath = path_1.default.join(getUploadBase(), subfolder);
            ensureDir(uploadPath);
            cb(null, uploadPath);
        },
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase();
            const filename = `${(0, uuid_1.v4)()}${ext}`;
            cb(null, filename);
        },
    });
};
const fileFilter = (_req, file, cb) => {
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype.toLowerCase();
    if (ALLOWED_MIME_TYPES.includes(mimeType) && ALLOWED_EXTENSIONS.includes(ext)) {
        cb(null, true);
    }
    else {
        cb(new Error(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
    }
};
exports.uploadPhoto = (0, multer_1.default)({
    storage: createStorage('photos'),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },
    fileFilter,
});
exports.uploadFaceImage = (0, multer_1.default)({
    storage: createStorage('faces'),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },
    fileFilter,
});
exports.uploadAttendanceImage = (0, multer_1.default)({
    storage: createStorage('attendance'),
    limits: {
        fileSize: env_1.default.MAX_FILE_SIZE,
        files: 1,
    },
    fileFilter,
});
exports.uploadInMemory = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: env_1.default.MAX_FILE_SIZE,
        files: 1,
    },
    fileFilter,
});
const handleMulterError = (err, _req, res, next) => {
    if (err instanceof multer_1.default.MulterError) {
        switch (err.code) {
            case 'LIMIT_FILE_SIZE':
                (0, response_1.errorResponse)(res, `File too large. Maximum size is ${env_1.default.MAX_FILE_SIZE / 1024 / 1024}MB`, 400);
                return;
            case 'LIMIT_FILE_COUNT':
                (0, response_1.errorResponse)(res, 'Too many files uploaded', 400);
                return;
            case 'LIMIT_UNEXPECTED_FILE':
                (0, response_1.errorResponse)(res, `Unexpected field: ${err.field}`, 400);
                return;
            default:
                (0, response_1.errorResponse)(res, `Upload error: ${err.message}`, 400);
                return;
        }
    }
    if (err.message.includes('Invalid file type')) {
        (0, response_1.errorResponse)(res, err.message, 400);
        return;
    }
    next(err);
};
exports.handleMulterError = handleMulterError;
const getFilePublicUrl = (filename, subfolder) => {
    return `/uploads/${subfolder}/${filename}`;
};
exports.getFilePublicUrl = getFilePublicUrl;
//# sourceMappingURL=upload.middleware.js.map