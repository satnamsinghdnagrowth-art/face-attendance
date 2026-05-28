import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from '../config/cloudinary';
import env from '../config/env';
import logger from '../utils/logger';
import { CustomError } from '../middleware/error.middleware';

const CLOUDINARY_BASE_FOLDER = 'face-attendance';

export class StorageService {
  ensureUploadDirs(): void {
    // No-op: Cloudinary handles storage
  }

  async saveFile(
    file: Express.Multer.File,
    subfolder: string,
    options?: { resize?: { width: number; height: number }; quality?: number }
  ): Promise<string> {
    if (!env.CLOUDINARY_CLOUD_NAME) {
      throw new CustomError('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.', 500);
    }

    let buffer = file.buffer;
    if (!buffer) {
      throw new CustomError('No file data available. Ensure multer memory storage is used.', 400);
    }

    if (options?.resize || options?.quality) {
      buffer = await this.processBuffer(buffer, file.originalname, options);
    }

    const publicId = `${CLOUDINARY_BASE_FOLDER}/${subfolder}/${uuidv4()}`;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '') || 'jpg';
    const format = ext === 'jpg' ? 'jpeg' : ext;

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { public_id: publicId, format, overwrite: true, resource_type: 'image' },
        (error, uploadResult) => {
          if (error) reject(error);
          else resolve(uploadResult as { secure_url: string });
        }
      ).end(buffer);
    });

    logger.debug('File uploaded to Cloudinary', { publicId, url: result.secure_url });
    return result.secure_url;
  }

  private async processBuffer(
    buffer: Buffer,
    originalname: string,
    options: { resize?: { width: number; height: number }; quality?: number }
  ): Promise<Buffer> {
    let pipeline = sharp(buffer);

    if (options.resize) {
      pipeline = pipeline.resize(options.resize.width, options.resize.height, {
        fit: 'cover',
        withoutEnlargement: true,
      });
    }

    const ext = path.extname(originalname).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') {
      pipeline = pipeline.jpeg({ quality: options.quality || 85 });
    } else if (ext === '.png') {
      pipeline = pipeline.png({ compressionLevel: 8 });
    } else if (ext === '.webp') {
      pipeline = pipeline.webp({ quality: options.quality || 85 });
    }

    return pipeline.toBuffer();
  }

  async deleteFile(fileUrl: string): Promise<void> {
    if (!fileUrl || !env.CLOUDINARY_CLOUD_NAME) return;

    const publicId = this.extractPublicId(fileUrl);
    if (!publicId) {
      logger.warn('Could not extract Cloudinary public_id from URL', { fileUrl });
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId);
      logger.debug('File deleted from Cloudinary', { publicId });
    } catch (error) {
      logger.warn('Failed to delete file from Cloudinary', { publicId, error });
    }
  }

  private extractPublicId(url: string): string | null {
    try {
      // URL format: https://res.cloudinary.com/cloud/image/upload/v123/folder/file.ext
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
      return match ? match[1] ?? null : null;
    } catch {
      return null;
    }
  }

  getFileUrl(filename: string, subfolder: string): string {
    return `/uploads/${subfolder}/${filename}`;
  }

  getAbsolutePath(filename: string, subfolder: string): string {
    return path.join(env.UPLOAD_DIR, subfolder, filename);
  }

  async getImageMetadata(fileUrl: string): Promise<sharp.Metadata> {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new CustomError('Failed to fetch image', 502);
    const buffer = Buffer.from(await response.arrayBuffer());
    return sharp(buffer).metadata();
  }

  async generateThumbnail(
    _sourcePath: string,
    _subfolder: string,
    _filename: string,
    _width = 150,
    _height = 150
  ): Promise<string> {
    throw new CustomError('generateThumbnail is not supported with Cloudinary storage', 501);
  }

  fileExists(_filename: string, _subfolder: string): boolean {
    return false;
  }

  getUploadBase(): string {
    return '';
  }
}

export const storageService = new StorageService();
export default storageService;
