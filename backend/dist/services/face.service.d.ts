import { FaceEmbedding, PublicUser } from '../types';
export declare class FaceService {
    registerFaceEmbedding(userId: string, embedding: number[], imageUrl?: string): Promise<void>;
    getUserEmbeddings(userId: string): Promise<FaceEmbedding[]>;
    private parseEmbeddingVector;
    verifyFace(userId: string, incomingEmbedding: number[]): Promise<{
        matched: boolean;
        confidence: number;
    }>;
    findMatchingStudent(classId: string, incomingEmbedding: number[]): Promise<{
        student: PublicUser;
        confidence: number;
    } | null>;
    deleteUserEmbeddings(userId: string): Promise<void>;
    deactivateUserEmbeddings(userId: string): Promise<void>;
    getFaceStats(userId: string): Promise<{
        count: number;
        lastUpdated: Date | null;
        isEnrolled: boolean;
    }>;
    getEnrollmentStatus(userId: string): Promise<{
        isEnrolled: boolean;
        embeddingCount: number;
        lastUpdated: Date | null;
    }>;
}
export declare const faceService: FaceService;
export default faceService;
//# sourceMappingURL=face.service.d.ts.map