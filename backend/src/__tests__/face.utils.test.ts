import sharp from 'sharp';
import path from 'path';
import os from 'os';
import fs from 'fs';
import {
  cosineSimilarity,
  normalizeEmbedding,
  validateEmbedding,
  findBestMatch,
  computeImageEmbedding,
} from '../utils/face.utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeImage = async (pixels: number[][], filePath: string): Promise<void> => {
  const height = pixels.length;
  const width = pixels[0]!.length;
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = pixels[y]![x]!;
      const idx = (y * width + x) * 3;
      buf[idx] = v;
      buf[idx + 1] = v;
      buf[idx + 2] = v;
    }
  }
  await sharp(buf, { raw: { width, height, channels: 3 } }).png().toFile(filePath);
};

const tmpFile = (suffix = '.png') =>
  path.join(os.tmpdir(), `face-test-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`);

// ─── cosineSimilarity ─────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns 0 when one vector is zero', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('throws on dimension mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });

  it('handles 128-dim vectors', () => {
    const a = new Array(128).fill(1);
    const b = new Array(128).fill(1);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });
});

// ─── normalizeEmbedding ───────────────────────────────────────────────────────

describe('normalizeEmbedding', () => {
  it('returns a unit-length vector', () => {
    const result = normalizeEmbedding([3, 4]);
    const mag = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeCloseTo(1);
  });

  it('throws for zero vector', () => {
    expect(() => normalizeEmbedding([0, 0, 0])).toThrow('Cannot normalize a zero vector');
  });

  it('preserves direction', () => {
    const result = normalizeEmbedding([2, 0, 0]);
    expect(result[0]).toBeCloseTo(1);
    expect(result[1]).toBeCloseTo(0);
  });
});

// ─── validateEmbedding ────────────────────────────────────────────────────────

describe('validateEmbedding', () => {
  it('accepts a valid 128-dim vector', () => {
    expect(validateEmbedding(new Array(128).fill(0.5)).valid).toBe(true);
  });

  it('accepts a zero vector (structurally valid)', () => {
    expect(validateEmbedding(new Array(128).fill(0)).valid).toBe(true);
  });

  it('rejects non-array', () => {
    expect(validateEmbedding('not-an-array').valid).toBe(false);
    expect(validateEmbedding(42).valid).toBe(false);
    expect(validateEmbedding(null).valid).toBe(false);
  });

  it('rejects empty array', () => {
    expect(validateEmbedding([]).valid).toBe(false);
  });

  it('rejects array shorter than 32', () => {
    expect(validateEmbedding(new Array(10).fill(0.5)).valid).toBe(false);
  });

  it('rejects array with NaN', () => {
    const e = new Array(128).fill(0.5);
    e[10] = NaN;
    expect(validateEmbedding(e).valid).toBe(false);
  });

  it('rejects array with Infinity', () => {
    const e = new Array(128).fill(0.5);
    e[0] = Infinity;
    expect(validateEmbedding(e).valid).toBe(false);
  });
});

// ─── findBestMatch ────────────────────────────────────────────────────────────

describe('findBestMatch', () => {
  it('returns null for empty candidates', () => {
    expect(findBestMatch([1, 0], [], 0.5)).toBeNull();
  });

  it('returns the best matching candidate', () => {
    const query = normalizeEmbedding([1, 0]);
    const candidates = [
      normalizeEmbedding([0, 1]),  // orthogonal → similarity ≈ 0
      normalizeEmbedding([1, 0]),  // identical  → similarity = 1
    ];
    const result = findBestMatch(query, candidates, 0.5);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(1);
    expect(result!.confidence).toBeCloseTo(1);
  });

  it('returns null when no candidate meets threshold', () => {
    const query = normalizeEmbedding([1, 0]);
    const candidates = [normalizeEmbedding([0, 1])];  // orthogonal
    expect(findBestMatch(query, candidates, 0.5)).toBeNull();
  });

  it('respects threshold boundary', () => {
    const query = normalizeEmbedding([1, 1]);
    const candidate = normalizeEmbedding([1, 1]);
    expect(findBestMatch(query, [candidate], 0.99)).not.toBeNull();
    expect(findBestMatch(query, [candidate], 1.01)).toBeNull();
  });
});

// ─── computeImageEmbedding ────────────────────────────────────────────────────

describe('computeImageEmbedding', () => {
  const files: string[] = [];

  afterAll(() => {
    for (const f of files) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it('returns a 128-dimensional vector', async () => {
    const img = tmpFile();
    files.push(img);
    // Gradient image: column value increases left-to-right
    const rows = Array.from({ length: 100 }, () =>
      Array.from({ length: 100 }, (_, x) => Math.floor((x / 99) * 200) + 28)
    );
    await makeImage(rows, img);

    const embedding = await computeImageEmbedding(img);
    expect(embedding).toHaveLength(128);
  });

  it('returns a non-zero vector for non-uniform images', async () => {
    const img = tmpFile();
    files.push(img);
    const rows = Array.from({ length: 100 }, (_, y) =>
      Array.from({ length: 100 }, (_, x) => ((x + y) * 2) % 256)
    );
    await makeImage(rows, img);

    const embedding = await computeImageEmbedding(img);
    const magnitude = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeGreaterThan(0);
  });

  it('produces consistent results for the same image', async () => {
    const img = tmpFile();
    files.push(img);
    const rows = Array.from({ length: 100 }, (_, y) =>
      Array.from({ length: 100 }, (_, x) => ((x * 3 + y * 2) % 200) + 30)
    );
    await makeImage(rows, img);

    const e1 = await computeImageEmbedding(img);
    const e2 = await computeImageEmbedding(img);
    expect(e1).toEqual(e2);
  });

  it('produces similar embeddings for images with the same pattern at different brightness', async () => {
    const img1 = tmpFile();
    const img2 = tmpFile();
    files.push(img1, img2);

    // Same spatial pattern, different brightness levels
    const pattern = Array.from({ length: 100 }, (_, y) =>
      Array.from({ length: 100 }, (_, x) => Math.floor((x / 99) * 180))
    );
    const dimmer = pattern.map((row) => row.map((v) => Math.min(255, v + 30)));

    await makeImage(pattern, img1);
    await makeImage(dimmer, img2);

    const e1 = await computeImageEmbedding(img1);
    const e2 = await computeImageEmbedding(img2);

    // Both images have the same gradient structure — similarity should be high
    const similarity = cosineSimilarity(e1, e2);
    expect(similarity).toBeGreaterThan(0.9);
  });

  it('produces different embeddings for clearly different images', async () => {
    const img1 = tmpFile();
    const img2 = tmpFile();
    files.push(img1, img2);

    // Image 1: dark left, bright right (left-to-right gradient)
    const horizontal = Array.from({ length: 100 }, () =>
      Array.from({ length: 100 }, (_, x) => Math.floor((x / 99) * 255))
    );
    // Image 2: dark top, bright bottom (top-to-bottom gradient) — flipped
    const vertical = Array.from({ length: 100 }, (_, y) =>
      Array.from({ length: 100 }, () => Math.floor((y / 99) * 255))
    );

    await makeImage(horizontal, img1);
    await makeImage(vertical, img2);

    const e1 = await computeImageEmbedding(img1);
    const e2 = await computeImageEmbedding(img2);

    // Horizontal vs vertical gradient — should not be identical
    const similarity = cosineSimilarity(e1, e2);
    expect(similarity).toBeLessThan(0.99);
  });

  it('handles JPEG files', async () => {
    const img = tmpFile('.jpg');
    files.push(img);
    const rows = Array.from({ length: 100 }, (_, y) =>
      Array.from({ length: 100 }, (_, x) => ((x + y) % 200) + 28)
    );
    await makeImage(rows.map(r => r), img.replace('.jpg', '.png'));
    await sharp(img.replace('.jpg', '.png')).jpeg({ quality: 90 }).toFile(img);
    files.push(img.replace('.jpg', '.png'));

    const embedding = await computeImageEmbedding(img);
    expect(embedding).toHaveLength(128);
  });
});
