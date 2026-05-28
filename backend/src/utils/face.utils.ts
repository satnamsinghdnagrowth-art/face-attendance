import sharp from 'sharp';
import env from '../config/env';

/**
 * Computes the cosine similarity between two embedding vectors.
 * Returns a value between -1 and 1, where 1 means identical direction.
 */
export const cosineSimilarity = (a: number[], b: number[]): number => {
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
    const ai = a[i] as number;
    const bi = b[i] as number;
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

/**
 * Computes the Euclidean distance between two embedding vectors.
 * Smaller values indicate more similarity.
 */
export const euclideanDistance = (a: number[], b: number[]): number => {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] as number) - (b[i] as number);
    sum += diff * diff;
  }

  return Math.sqrt(sum);
};

/**
 * Normalizes an embedding vector to unit length (L2 normalization).
 */
export const normalizeEmbedding = (embedding: number[]): number[] => {
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

  if (magnitude === 0) {
    throw new Error('Cannot normalize a zero vector');
  }

  return embedding.map((val) => val / magnitude);
};

/**
 * Checks if two face embeddings match based on cosine similarity threshold.
 * Normalizes both vectors before comparison for consistency.
 */
export const isFaceMatch = (
  embedding1: number[],
  embedding2: number[],
  threshold: number = env.FACE_SIMILARITY_THRESHOLD
): boolean => {
  const normalized1 = normalizeEmbedding(embedding1);
  const normalized2 = normalizeEmbedding(embedding2);
  const similarity = cosineSimilarity(normalized1, normalized2);
  return similarity >= threshold;
};

/**
 * Returns the cosine similarity between two (normalized) embeddings as a confidence score (0–1).
 */
export const getFaceConfidence = (embedding1: number[], embedding2: number[]): number => {
  const normalized1 = normalizeEmbedding(embedding1);
  const normalized2 = normalizeEmbedding(embedding2);
  const similarity = cosineSimilarity(normalized1, normalized2);
  // Clamp to [0, 1] range
  return Math.max(0, Math.min(1, similarity));
};

/**
 * Validates that an embedding is well-formed.
 */
export const validateEmbedding = (
  embedding: unknown
): { valid: boolean; error?: string } => {
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

/**
 * Computes a 128-dimensional embedding from an image file using pixel intensity.
 *
 * Strategy: center-crop the image to focus on the face region (faces are
 * typically centred in portrait/selfie shots), then resize to 16×8 grayscale,
 * apply auto-levels, and z-score normalise.
 *
 * The crop takes the middle 60 % of the image width and a region starting
 * slightly above the vertical midpoint (bias toward where a face sits in
 * selfies / attendance shots).  This makes the embedding far more robust
 * across different shooting distances and backgrounds than using the full frame.
 */
export const computeImageEmbedding = async (imagePath: string): Promise<number[]> => {
  // Read image dimensions so we can derive a face-centred crop
  const metadata = await sharp(imagePath).metadata();
  const imgW = metadata.width ?? 640;
  const imgH = metadata.height ?? 640;

  // Center-crop: 60 % of the shorter dimension, biased slightly upward
  const cropSize = Math.floor(Math.min(imgW, imgH) * 0.6);
  const left = Math.floor((imgW - cropSize) / 2);
  // Place crop slightly above vertical centre (faces sit in the upper half of
  // typical portrait shots)
  const top = Math.max(0, Math.floor((imgH - cropSize) / 3));

  const { data } = await sharp(imagePath)
    .extract({ left, top, width: cropSize, height: cropSize })
    .resize(16, 8, { fit: 'fill' })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Array.from(data); // 128 uint8 values (0-255) after normalize
  const n = pixels.length;

  const mean = pixels.reduce((s, v) => s + v, 0) / n;
  const variance = pixels.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  if (std < 1e-6) {
    // Near-uniform image — return position-based fallback to avoid zero vector
    return pixels.map((_, i) => (i - n / 2) / n);
  }

  return pixels.map((v) => (v - mean) / std);
};

/**
 * Finds the best matching embedding from a list and returns its index and confidence.
 */
export const findBestMatch = (
  queryEmbedding: number[],
  candidateEmbeddings: number[][],
  threshold: number = env.FACE_SIMILARITY_THRESHOLD
): { index: number; confidence: number } | null => {
  if (candidateEmbeddings.length === 0) return null;

  const normalizedQuery = normalizeEmbedding(queryEmbedding);
  let bestIndex = -1;
  let bestSimilarity = -1;

  for (let i = 0; i < candidateEmbeddings.length; i++) {
    const candidate = candidateEmbeddings[i];
    if (!candidate || candidate.length === 0) continue;

    const normalizedCandidate = normalizeEmbedding(candidate);
    const similarity = cosineSimilarity(normalizedQuery, normalizedCandidate);

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
