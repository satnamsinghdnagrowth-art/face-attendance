import sharp from 'sharp';
export declare class StorageService {
    private readonly uploadBase;
    constructor();
    ensureUploadDirs(): void;
    saveFile(file: Express.Multer.File, subfolder: string, options?: {
        resize?: {
            width: number;
            height: number;
        };
        quality?: number;
    }): Promise<string>;
    private processAndSaveImage;
    private processBufferAndSave;
    deleteFile(filePath: string): Promise<void>;
    getFileUrl(filename: string, subfolder: string): string;
    getAbsolutePath(filename: string, subfolder: string): string;
    getImageMetadata(filePath: string): Promise<sharp.Metadata>;
    generateThumbnail(sourcePath: string, subfolder: string, filename: string, width?: number, height?: number): Promise<string>;
    fileExists(filename: string, subfolder: string): boolean;
    getUploadBase(): string;
}
export declare const storageService: StorageService;
export default storageService;
//# sourceMappingURL=storage.service.d.ts.map