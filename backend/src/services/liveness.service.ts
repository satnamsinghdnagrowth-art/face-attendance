import logger from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LivenessResult {
  /** Whether the subject is determined to be a live person (not a photo/screen). */
  is_live: boolean;
  /** Confidence score between 0.0 (definitely spoofed) and 1.0 (definitely live). */
  liveness_score: number;
  /** The detection method used (stub | vision_api | rekognition | tf_model | bioid). */
  method: string;
  /** Human-readable message describing the result. */
  message: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class LivenessService {
  /**
   * Check whether the supplied image depicts a live person (anti-spoofing).
   *
   * ── CURRENT STATE ────────────────────────────────────────────────────────────
   * Returns a stub result that always passes liveness. Replace this method body
   * with one of the production implementations below before going live.
   *
   * ── PRODUCTION IMPLEMENTATION OPTIONS ────────────────────────────────────────
   *
   * 1. **Google Cloud Vision SafeSearch API** (cloud, paid)
   *    - Uses the `@google-cloud/vision` package.
   *    - Call `client.safeSearchDetection(imageBuffer)` and inspect the
   *      `adult`, `spoof`, and `violence` likelihood fields.
   *    - A `LIKELY` or `VERY_LIKELY` spoof result means the image is not live.
   *    - Docs: https://cloud.google.com/vision/docs/detecting-safe-search
   *
   * 2. **AWS Rekognition Face Detection** (cloud, paid)
   *    - Use `rekognition.detectFaces({ Attributes: ['ALL'] })`.
   *    - Check `FaceDetail.EyesOpen.Value === true` and
   *      `FaceDetail.FaceOccluded.Value === false`.
   *    - For stronger liveness, use `rekognition.startFaceLivenessSession()`
   *      (FaceLivenessDetection feature — requires mobile SDK on client side).
   *    - Docs: https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html
   *
   * 3. **Custom ML model with TensorFlow.js** (local, free)
   *    - `npm install @tensorflow/tfjs-node`
   *    - Load a pre-trained anti-spoofing model (e.g. MiniFASNet from the
   *      Silent-Face-Anti-Spoofing repository converted to TF SavedModel format).
   *    - Preprocess: resize to 80×80, normalise to [0,1], expand dims.
   *    - `const tensor = tf.node.decodeImage(imageBuffer);`
   *    - `const prediction = model.predict(tensor) as tf.Tensor;`
   *    - A softmax output > 0.5 on the "live" class indicates a live face.
   *
   * 4. **BioID API** (cloud, paid, highest accuracy)
   *    - REST API: `POST https://bws.bioid.com/extension/livedetection`
   *    - Attach the image as multipart/form-data.
   *    - Returns `{ "Live": true|false, "Score": 0.0–1.0 }`.
   *    - Docs: https://developer.bioid.com/bws/livedetection
   *
   * @param imageBuffer - Raw image bytes (JPEG or PNG).
   * @returns A LivenessResult describing whether the subject is live.
   */
  async checkLiveness(imageBuffer: Buffer): Promise<LivenessResult> {
    // Silence the "unused variable" warning while keeping the signature correct.
    void imageBuffer;

    logger.debug('Liveness check invoked (stub — always returns live)');

    return {
      is_live: true,
      liveness_score: 0.95,
      method: 'stub',
      message: 'Liveness check not implemented — stub returns live',
    };
  }
}

export const livenessService = new LivenessService();
export default livenessService;
