import { query, withTransaction } from '../config/database';
import { FaceEmbedding, PublicUser, User } from '../types';
import {
  cosineSimilarity,
  normalizeEmbedding,
  findBestMatch,
  validateEmbedding,
} from '../utils/face.utils';
import { CustomError, NotFoundError } from '../middleware/error.middleware';
import env from '../config/env';
import logger from '../utils/logger';

export class FaceService {
  async registerFaceEmbedding(
    userId: string,
    embedding: number[],
    imageUrl?: string
  ): Promise<void> {
    const validation = validateEmbedding(embedding);
    if (!validation.valid) {
      throw new CustomError(`Invalid embedding: ${validation.error}`, 400);
    }

    // Verify user exists
    const userResult = await query<{ id: string }>(
      'SELECT id FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Get current version count
    const versionResult = await query<{ max_version: number | null }>(
      'SELECT MAX(version) as max_version FROM face_embeddings WHERE user_id = $1',
      [userId]
    );

    const nextVersion = (versionResult.rows[0]?.max_version || 0) + 1;

    // Convert embedding array to PostgreSQL array literal
    const embeddingArray = `{${embedding.join(',')}}`;

    await query(
      `INSERT INTO face_embeddings (user_id, embedding_vector, image_url, version, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [userId, embeddingArray, imageUrl, nextVersion]
    );

    logger.info('Face embedding registered', { userId, version: nextVersion });
  }

  async getUserEmbeddings(userId: string): Promise<FaceEmbedding[]> {
    const result = await query<FaceEmbedding>(
      `SELECT id, user_id, embedding_vector, image_url, version, is_active, created_at
       FROM face_embeddings
       WHERE user_id = $1 AND is_active = true
       ORDER BY version DESC`,
      [userId]
    );

    return result.rows.map((row) => ({
      ...row,
      embedding_vector: Array.isArray(row.embedding_vector)
        ? row.embedding_vector
        : this.parseEmbeddingVector(row.embedding_vector as unknown as string),
    }));
  }

  private parseEmbeddingVector(raw: string | number[]): number[] {
    if (Array.isArray(raw)) return raw;
    // PostgreSQL returns float8[] as "{val1,val2,...}"
    if (typeof raw === 'string') {
      return raw
        .replace(/^\{|\}$/g, '')
        .split(',')
        .map((v) => parseFloat(v.trim()));
    }
    return [];
  }

  async verifyFace(
    userId: string,
    incomingEmbedding: number[]
  ): Promise<{ matched: boolean; confidence: number }> {
    const validation = validateEmbedding(incomingEmbedding);
    if (!validation.valid) {
      throw new CustomError(`Invalid embedding: ${validation.error}`, 400);
    }

    const embeddings = await this.getUserEmbeddings(userId);
    if (embeddings.length === 0) {
      return { matched: false, confidence: 0 };
    }

    const normalizedIncoming = normalizeEmbedding(incomingEmbedding);
    let bestSimilarity = -1;

    for (const stored of embeddings) {
      if (!stored.embedding_vector || stored.embedding_vector.length === 0) continue;

      const mag = Math.sqrt(stored.embedding_vector.reduce((s, v) => s + v * v, 0));
      if (mag === 0) continue; // skip old zero-enrollment artefacts

      const normalizedStored = normalizeEmbedding(stored.embedding_vector);
      const similarity = cosineSimilarity(normalizedIncoming, normalizedStored);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
      }
    }

    const confidence = Math.max(0, Math.min(1, bestSimilarity));
    const matched = confidence >= env.FACE_SIMILARITY_THRESHOLD;

    logger.debug('Face verification result', { userId, confidence, matched });
    return { matched, confidence };
  }

  async findMatchingStudent(
    classId: string,
    incomingEmbedding: number[]
  ): Promise<{ student: PublicUser; confidence: number } | null> {
    const validation = validateEmbedding(incomingEmbedding);
    if (!validation.valid) {
      throw new CustomError(`Invalid embedding: ${validation.error}`, 400);
    }

    // Zero vector means no face was detected — cannot match anyone
    const magnitude = Math.sqrt(incomingEmbedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) {
      logger.debug('Zero embedding received — no face detected, skipping match');
      return null;
    }

    // Load all active embeddings for students enrolled in the class
    const result = await query<{
      user_id: string;
      embedding_vector: string | number[];
      name: string;
      email: string;
      phone: string | null;
      role: string;
      photo_url: string | null;
      is_active: boolean;
      last_login: Date | null;
      created_at: Date;
    }>(
      `SELECT fe.user_id, fe.embedding_vector,
              u.name, u.email, u.phone, u.role, u.photo_url, u.is_active,
              u.last_login, u.created_at
       FROM face_embeddings fe
       JOIN users u ON u.id = fe.user_id
       JOIN class_enrollments ce ON ce.student_id = fe.user_id
       WHERE ce.class_id = $1
         AND fe.is_active = true
         AND u.is_active = true
         AND u.role = 'student'`,
      [classId]
    );

    if (result.rows.length === 0) {
      logger.debug('No face embeddings found for class', { classId });
      return null;
    }

    // Group embeddings by user_id (a student may have multiple embeddings)
    const userEmbeddingsMap = new Map<string, { embeddings: number[][]; userInfo: typeof result.rows[0] }>();

    for (const row of result.rows) {
      const embedding = this.parseEmbeddingVector(row.embedding_vector);

      // Skip zero-magnitude stored embeddings (artefacts from old stub-based enrollment)
      const mag = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
      if (mag === 0) continue;

      const existing = userEmbeddingsMap.get(row.user_id);

      if (existing) {
        existing.embeddings.push(embedding);
      } else {
        userEmbeddingsMap.set(row.user_id, {
          embeddings: [embedding],
          userInfo: row,
        });
      }
    }

    const normalizedIncoming = normalizeEmbedding(incomingEmbedding);
    let bestMatch: { userId: string; confidence: number } | null = null;

    for (const [userId, { embeddings }] of userEmbeddingsMap) {
      const match = findBestMatch(normalizedIncoming, embeddings, env.FACE_SIMILARITY_THRESHOLD);
      if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
        bestMatch = { userId, confidence: match.confidence };
      }
    }

    if (!bestMatch) {
      logger.debug('No matching student found', { classId });
      return null;
    }

    const userInfo = userEmbeddingsMap.get(bestMatch.userId)!.userInfo;

    const student: PublicUser = {
      id: userInfo.user_id,
      name: userInfo.name,
      email: userInfo.email,
      phone: userInfo.phone || undefined,
      role: userInfo.role as PublicUser['role'],
      photo_url: userInfo.photo_url || undefined,
      is_active: userInfo.is_active,
      last_login: userInfo.last_login || undefined,
      created_at: userInfo.created_at,
    };

    logger.info('Student matched by face', {
      classId,
      studentId: bestMatch.userId,
      confidence: bestMatch.confidence,
    });

    return { student, confidence: bestMatch.confidence };
  }

  async deleteUserEmbeddings(userId: string): Promise<void> {
    const result = await query(
      'DELETE FROM face_embeddings WHERE user_id = $1',
      [userId]
    );

    logger.info('Face embeddings deleted', { userId, count: result.rowCount });
  }

  async deactivateUserEmbeddings(userId: string): Promise<void> {
    await query(
      'UPDATE face_embeddings SET is_active = false WHERE user_id = $1',
      [userId]
    );
    logger.info('Face embeddings deactivated', { userId });
  }

  async getFaceStats(userId: string): Promise<{
    count: number;
    lastUpdated: Date | null;
    isEnrolled: boolean;
  }> {
    const result = await query<{ count: string; last_updated: Date | null }>(
      `SELECT COUNT(*) as count, MAX(created_at) as last_updated
       FROM face_embeddings
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    );

    const row = result.rows[0];
    const count = parseInt(row?.count || '0', 10);

    return {
      count,
      lastUpdated: row?.last_updated || null,
      isEnrolled: count > 0,
    };
  }

  async getEnrollmentStatus(userId: string): Promise<{
    isEnrolled: boolean;
    embeddingCount: number;
    lastUpdated: Date | null;
  }> {
    const stats = await this.getFaceStats(userId);
    return {
      isEnrolled: stats.isEnrolled,
      embeddingCount: stats.count,
      lastUpdated: stats.lastUpdated,
    };
  }
}

export const faceService = new FaceService();
export default faceService;
