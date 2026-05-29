/**
 * OCR Service — Phase 3 Stub
 *
 * Extracts text from ID card images. Currently returns a stub result.
 *
 * To implement production OCR, replace this stub with one of:
 *
 * Option A — Tesseract.js (local, free, ~15MB bundle):
 *   npm install tesseract.js
 *   const { createWorker } = require('tesseract.js');
 *   const worker = await createWorker('eng');
 *   const { data: { text } } = await worker.recognize(imageBuffer);
 *
 * Option B — Google Cloud Vision API (cloud, highest accuracy):
 *   npm install @google-cloud/vision
 *   const client = new vision.ImageAnnotatorClient();
 *   const [result] = await client.textDetection(imageBuffer);
 *
 * Option C — AWS Textract (cloud, structured document analysis):
 *   npm install @aws-sdk/client-textract
 *   const client = new TextractClient({ region: 'us-east-1' });
 *
 * Pattern matching for common ID formats:
 *   - Indian Aadhaar: /\d{4}\s\d{4}\s\d{4}/
 *   - University roll number: /\d{4}[A-Z]{2}\d{3,5}/
 *   - Passport: /[A-Z]{1}[0-9]{7}/
 */

import logger from '../utils/logger';

export interface OCRResult {
  success: boolean;
  extracted_text: string | null;
  id_number: string | null;
  name: string | null;
  confidence: number;   // 0.0 – 1.0
  method: string;
}

export class OCRService {
  /**
   * Extract text and structured data from an ID card image.
   * Replace this stub with a real OCR implementation.
   */
  async extractIDCardData(_imageBuffer: Buffer): Promise<OCRResult> {
    // Stub — real implementation goes here
    logger.debug('OCR.extractIDCardData called (stub — no real OCR configured)');
    return {
      success: false,
      extracted_text: null,
      id_number: null,
      name: null,
      confidence: 0,
      method: 'stub',
    };
  }

  /**
   * Parse common ID number patterns from raw OCR text.
   * Used after real OCR returns a text string.
   */
  parseIDNumber(text: string): string | null {
    const patterns = [
      /\b\d{4}\s?\d{4}\s?\d{4}\b/,           // Aadhaar
      /\b[A-Z]{1,2}\d{6,8}\b/,                // Passport
      /\b\d{4}[A-Z]{2}\d{3,5}\b/i,            // University roll
      /\b\d{10,12}\b/,                          // Generic 10-12 digit ID
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0].replace(/\s/g, '');
    }
    return null;
  }
}

export const ocrService = new OCRService();
export default ocrService;
