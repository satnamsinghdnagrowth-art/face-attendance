export declare const cosineSimilarity: (a: number[], b: number[]) => number;
export declare const euclideanDistance: (a: number[], b: number[]) => number;
export declare const normalizeEmbedding: (embedding: number[]) => number[];
export declare const isFaceMatch: (embedding1: number[], embedding2: number[], threshold?: number) => boolean;
export declare const getFaceConfidence: (embedding1: number[], embedding2: number[]) => number;
export declare const validateEmbedding: (embedding: unknown) => {
    valid: boolean;
    error?: string;
};
export declare const computeImageEmbedding: (imagePath: string) => Promise<number[]>;
export declare const findBestMatch: (queryEmbedding: number[], candidateEmbeddings: number[][], threshold?: number) => {
    index: number;
    confidence: number;
} | null;
//# sourceMappingURL=face.utils.d.ts.map