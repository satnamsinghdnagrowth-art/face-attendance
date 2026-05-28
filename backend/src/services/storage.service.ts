import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import env from '../config/env';
import logger from '../utils/logger';
import { CustomError } from '../middleware/error.middleware';

const SUBFOLDERS = ['photos', 'faces', 'attendance'];

export class StorageService {
  private readonly uploadBase: string;

  constructor() {
    this.uploadBase = path.isAbsolute(env.UPLOAD_DIR)
      ? env.UPLOAD_DIR
      : path.join(process.cwd(), env.UPLOAD_DIR);
  }

  ensureUploadDirs(): void {
    // Ensure base upload directory exists
    if (!fs.existsSync(this.uploadBase)) {
      fs.mkdirSync(this.uploadBase, { recursive: true });
      logger.info(`Created upload base directory: ${this.uploadBase}`);
    }

    // Ensure all subfolders exist
    for (const subfolder of SUBFOLDERS) {
      const dirPath = path.join(this.uploadBase, subfolder);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.info(`Created upload directory: ${dirPath}`);
      }
    }
  }

  async saveFile(
    file: Express.Multer.File,
    subfolder: string,
    options?: { resize?: { width: number; height: number }; quality?: number }
  ): Promise<string> {
    const targetDir = path.join(this.uploadBase, subfolder);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filename = file.filename || path.basename(file.path);
    const targetPath = path.join(targetDir, filename);

    // If the file is already on disk (disk storage), optionally process with sharp
    if (file.path && fs.existsSync(file.path)) {
      if (options?.resize || options?.quality) {
        await this.processAndSaveImage(file.path, targetPath, options);
        // If the file was saved to a different location, move it
        if (file.path !== targetPath) {
          fs.unlinkSync(file.path);
        }
      } else if (file.path !== targetPath) {
        fs.renameSync(file.path, targetPath);
      }
    } else if (file.buffer) {
      // Memory storage — write buffer to disk, optionally processing
      if (options?.resize || options?.quality) {
        await this.processBufferAndSave(file.buffer, targetPath, options);
      } else {
        fs.writeFileSync(targetPath, file.buffer);
      }
    }

    const publicUrl = this.getFileUrl(filename, subfolder);
    logger.debug('File saved', { filename, subfolder, publicUrl });
    return publicUrl;
  }

  private async processAndSaveImage(
    sourcePath: string,
    targetPath: string,
    options: { resize?: { width: number; height: number }; quality?: number }
  ): Promise<void> {
    let pipeline = sharp(sourcePath);

    if (options.resize) {
      pipeline = pipeline.resize(options.resize.width, options.resize.height, {
        fit: 'cover',
        withoutEnlargement: true,
      });
    }

    const ext = path.extname(targetPath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') {
      pipeline = pipeline.jpeg({ quality: options.quality || 85 });
    } else if (ext === '.png') {
      pipeline = pipeline.png({ compressionLevel: 8 });
    } else if (ext === '.webp') {
      pipeline = pipeline.webp({ quality: options.quality || 85 });
    }

    // Sharp cannot read and write the same file — use a temp path then rename
    if (sourcePath === targetPath) {
      const tmpPath = `${targetPath}.tmp`;
      try {
        await pipeline.toFile(tmpPath);
        fs.renameSync(tmpPath, targetPath);
      } catch (err) {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        throw err;
      }
    } else {
      await pipeline.toFile(targetPath);
    }
  }

  private async processBufferAndSave(
    buffer: Buffer,
    targetPath: string,
    options: { resize?: { width: number; height: number }; quality?: number }
  ): Promise<void> {
    let pipeline = sharp(buffer);

    if (options.resize) {
      pipeline = pipeline.resize(options.resize.width, options.resize.height, {
        fit: 'cover',
        withoutEnlargement: true,
      });
    }

    const ext = path.extname(targetPath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') {
      pipeline = pipeline.jpeg({ quality: options.quality || 85 });
    } else if (ext === '.png') {
      pipeline = pipeline.png({ compressionLevel: 8 });
    } else if (ext === '.webp') {
      pipeline = pipeline.webp({ quality: options.quality || 85 });
    }

    await pipeline.toFile(targetPath);
  }

  async deleteFile(filePath: string): Promise<void> {
    // filePath can be a public URL like /uploads/photos/uuid.jpg or an absolute path
    let absolutePath: string;

    if (filePath.startsWith('/uploads/')) {
      absolutePath = path.join(this.uploadBase, '..', filePath);
    } else if (path.isAbsolute(filePath)) {
      absolutePath = filePath;
    } else {
      absolutePath = path.join(this.uploadBase, filePath);
    }

    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      logger.debug('File deleted', { path: absolutePath });
    } else {
      logger.warn('File not found for deletion', { path: absolutePath });
    }
  }

  getFileUrl(filename: string, subfolder: string): string {
    return `/uploads/${subfolder}/${filename}`;
  }

  getAbsolutePath(filename: string, subfolder: string): string {
    return path.join(this.uploadBase, subfolder, filename);
  }

  async getImageMetadata(filePath: string): Promise<sharp.Metadata> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.uploadBase, filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new CustomError('File not found', 404);
    }

    return sharp(absolutePath).metadata();
  }

  async generateThumbnail(
    sourcePath: string,
    subfolder: string,
    filename: string,
    width: number = 150,
    height: number = 150
  ): Promise<string> {
    const thumbFilename = `thumb_${filename}`;
    const targetPath = path.join(this.uploadBase, subfolder, thumbFilename);

    await sharp(sourcePath)
      .resize(width, height, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toFile(targetPath);

    return this.getFileUrl(thumbFilename, subfolder);
  }

  fileExists(filename: string, subfolder: string): boolean {
    const absolutePath = this.getAbsolutePath(filename, subfolder);
    return fs.existsSync(absolutePath);
  }

  getUploadBase(): string {
    return this.uploadBase;
  }
}

export const storageService = new StorageService();
export default storageService;
