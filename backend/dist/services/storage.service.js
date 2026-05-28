"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageService = exports.StorageService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const env_1 = __importDefault(require("../config/env"));
const logger_1 = __importDefault(require("../utils/logger"));
const error_middleware_1 = require("../middleware/error.middleware");
const SUBFOLDERS = ['photos', 'faces', 'attendance'];
class StorageService {
    constructor() {
        this.uploadBase = path_1.default.isAbsolute(env_1.default.UPLOAD_DIR)
            ? env_1.default.UPLOAD_DIR
            : path_1.default.join(process.cwd(), env_1.default.UPLOAD_DIR);
    }
    ensureUploadDirs() {
        if (!fs_1.default.existsSync(this.uploadBase)) {
            fs_1.default.mkdirSync(this.uploadBase, { recursive: true });
            logger_1.default.info(`Created upload base directory: ${this.uploadBase}`);
        }
        for (const subfolder of SUBFOLDERS) {
            const dirPath = path_1.default.join(this.uploadBase, subfolder);
            if (!fs_1.default.existsSync(dirPath)) {
                fs_1.default.mkdirSync(dirPath, { recursive: true });
                logger_1.default.info(`Created upload directory: ${dirPath}`);
            }
        }
    }
    async saveFile(file, subfolder, options) {
        const targetDir = path_1.default.join(this.uploadBase, subfolder);
        if (!fs_1.default.existsSync(targetDir)) {
            fs_1.default.mkdirSync(targetDir, { recursive: true });
        }
        const filename = file.filename || path_1.default.basename(file.path);
        const targetPath = path_1.default.join(targetDir, filename);
        if (file.path && fs_1.default.existsSync(file.path)) {
            if (options?.resize || options?.quality) {
                await this.processAndSaveImage(file.path, targetPath, options);
                if (file.path !== targetPath) {
                    fs_1.default.unlinkSync(file.path);
                }
            }
            else if (file.path !== targetPath) {
                fs_1.default.renameSync(file.path, targetPath);
            }
        }
        else if (file.buffer) {
            if (options?.resize || options?.quality) {
                await this.processBufferAndSave(file.buffer, targetPath, options);
            }
            else {
                fs_1.default.writeFileSync(targetPath, file.buffer);
            }
        }
        const publicUrl = this.getFileUrl(filename, subfolder);
        logger_1.default.debug('File saved', { filename, subfolder, publicUrl });
        return publicUrl;
    }
    async processAndSaveImage(sourcePath, targetPath, options) {
        let pipeline = (0, sharp_1.default)(sourcePath);
        if (options.resize) {
            pipeline = pipeline.resize(options.resize.width, options.resize.height, {
                fit: 'cover',
                withoutEnlargement: true,
            });
        }
        const ext = path_1.default.extname(targetPath).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') {
            pipeline = pipeline.jpeg({ quality: options.quality || 85 });
        }
        else if (ext === '.png') {
            pipeline = pipeline.png({ compressionLevel: 8 });
        }
        else if (ext === '.webp') {
            pipeline = pipeline.webp({ quality: options.quality || 85 });
        }
        if (sourcePath === targetPath) {
            const tmpPath = `${targetPath}.tmp`;
            try {
                await pipeline.toFile(tmpPath);
                fs_1.default.renameSync(tmpPath, targetPath);
            }
            catch (err) {
                if (fs_1.default.existsSync(tmpPath))
                    fs_1.default.unlinkSync(tmpPath);
                throw err;
            }
        }
        else {
            await pipeline.toFile(targetPath);
        }
    }
    async processBufferAndSave(buffer, targetPath, options) {
        let pipeline = (0, sharp_1.default)(buffer);
        if (options.resize) {
            pipeline = pipeline.resize(options.resize.width, options.resize.height, {
                fit: 'cover',
                withoutEnlargement: true,
            });
        }
        const ext = path_1.default.extname(targetPath).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') {
            pipeline = pipeline.jpeg({ quality: options.quality || 85 });
        }
        else if (ext === '.png') {
            pipeline = pipeline.png({ compressionLevel: 8 });
        }
        else if (ext === '.webp') {
            pipeline = pipeline.webp({ quality: options.quality || 85 });
        }
        await pipeline.toFile(targetPath);
    }
    async deleteFile(filePath) {
        let absolutePath;
        if (filePath.startsWith('/uploads/')) {
            absolutePath = path_1.default.join(this.uploadBase, '..', filePath);
        }
        else if (path_1.default.isAbsolute(filePath)) {
            absolutePath = filePath;
        }
        else {
            absolutePath = path_1.default.join(this.uploadBase, filePath);
        }
        if (fs_1.default.existsSync(absolutePath)) {
            fs_1.default.unlinkSync(absolutePath);
            logger_1.default.debug('File deleted', { path: absolutePath });
        }
        else {
            logger_1.default.warn('File not found for deletion', { path: absolutePath });
        }
    }
    getFileUrl(filename, subfolder) {
        return `/uploads/${subfolder}/${filename}`;
    }
    getAbsolutePath(filename, subfolder) {
        return path_1.default.join(this.uploadBase, subfolder, filename);
    }
    async getImageMetadata(filePath) {
        const absolutePath = path_1.default.isAbsolute(filePath)
            ? filePath
            : path_1.default.join(this.uploadBase, filePath);
        if (!fs_1.default.existsSync(absolutePath)) {
            throw new error_middleware_1.CustomError('File not found', 404);
        }
        return (0, sharp_1.default)(absolutePath).metadata();
    }
    async generateThumbnail(sourcePath, subfolder, filename, width = 150, height = 150) {
        const thumbFilename = `thumb_${filename}`;
        const targetPath = path_1.default.join(this.uploadBase, subfolder, thumbFilename);
        await (0, sharp_1.default)(sourcePath)
            .resize(width, height, { fit: 'cover' })
            .jpeg({ quality: 70 })
            .toFile(targetPath);
        return this.getFileUrl(thumbFilename, subfolder);
    }
    fileExists(filename, subfolder) {
        const absolutePath = this.getAbsolutePath(filename, subfolder);
        return fs_1.default.existsSync(absolutePath);
    }
    getUploadBase() {
        return this.uploadBase;
    }
}
exports.StorageService = StorageService;
exports.storageService = new StorageService();
exports.default = exports.storageService;
//# sourceMappingURL=storage.service.js.map