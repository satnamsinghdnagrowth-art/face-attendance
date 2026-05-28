import * as ImageManipulator from 'expo-image-manipulator';
import { DetectedFace } from '@/types';

export interface FaceQualityResult {
  valid: boolean;
  reason: string;
}

export interface LivenessResult {
  passed: boolean;
  reason: string;
  score: number;
}

class FaceRecognitionService {
  private readonly MIN_FACE_SIZE = 0.18; // Face must be at least 18% of frame
  private readonly MAX_YAW_ANGLE = 30;
  private readonly MAX_ROLL_ANGLE = 20;
  private lastDetectionTime = 0;
  private readonly DETECTION_DEBOUNCE = 300; // ms

  // expo-face-detector was removed in SDK 52. Face detection now happens via
  // CameraView's onFacesDetected callback (SDK 51) or is delegated to the backend.
  async detectFaces(_imageUri: string): Promise<DetectedFace[]> {
    return [];
  }

  /**
   * Crop the face region from an image using detected bounds
   */
  async cropFaceFromImage(
    imageUri: string,
    bounds: { x: number; y: number; width: number; height: number }
  ): Promise<string> {
    // Add padding around the face
    const padding = Math.min(bounds.width * 0.25, bounds.height * 0.25);
    const cropRegion = {
      originX: Math.max(0, bounds.x - padding),
      originY: Math.max(0, bounds.y - padding),
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2,
    };

    try {
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: Math.round(cropRegion.originX),
              originY: Math.round(cropRegion.originY),
              width: Math.round(cropRegion.width),
              height: Math.round(cropRegion.height),
            },
          },
          { resize: { width: 224, height: 224 } },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      return result.uri;
    } catch (error) {
      console.warn('Face crop error:', error);
      return imageUri;
    }
  }

  /**
   * Generate a simplified 128-float embedding from face detection landmarks.
   * This uses the positions of facial keypoints normalized to [0, 1] range.
   * The actual robust embedding is computed server-side; this is used as a
   * pre-filter/quick-verify signal.
   */
  generateEmbeddingFromLandmarks(face: DetectedFace): number[] {
    const { bounds } = face;
    const bw = bounds.size.width;
    const bh = bounds.size.height;
    const bx = bounds.origin.x;
    const by = bounds.origin.y;

    // Normalize landmarks relative to bounding box [0, 1]
    const normalize = (point: { x: number; y: number } | undefined): [number, number] => {
      if (!point) return [0.5, 0.5];
      return [(point.x - bx) / bw, (point.y - by) / bh];
    };

    const [lex, ley] = normalize(face.leftEyePosition);
    const [rex, rey] = normalize(face.rightEyePosition);
    const [nx, ny] = normalize(face.noseBasePosition);
    const [mx, my] = normalize(face.mouthPosition);
    const [lmx, lmy] = normalize(face.leftMouthPosition);
    const [rmx, rmy] = normalize(face.rightMouthPosition);
    const [lcx, lcy] = normalize(face.leftCheekPosition);
    const [rcx, rcy] = normalize(face.rightCheekPosition);
    const [leax, leay] = normalize(face.leftEarPosition);
    const [reax, reay] = normalize(face.rightEarPosition);
    const [bmx, bmy] = normalize(face.bottomMouthPosition);

    // Geometric features derived from landmark positions
    const eyeDistance = Math.sqrt((rex - lex) ** 2 + (rey - ley) ** 2);
    const eyeCenterX = (lex + rex) / 2;
    const eyeCenterY = (ley + rey) / 2;
    const noseToMouth = Math.sqrt((nx - mx) ** 2 + (ny - my) ** 2);
    const faceAspectRatio = bh / Math.max(bw, 1);
    const eyeToNoseX = nx - eyeCenterX;
    const eyeToNoseY = ny - eyeCenterY;
    const leftEyeToNose = Math.sqrt((lex - nx) ** 2 + (ley - ny) ** 2);
    const rightEyeToNose = Math.sqrt((rex - nx) ** 2 + (rey - ny) ** 2);
    const eyeSymmetry = leftEyeToNose / Math.max(rightEyeToNose, 0.001);
    const mouthWidth = Math.sqrt((lmx - rmx) ** 2 + (lmy - rmy) ** 2);
    const mouthToNose = Math.sqrt((mx - nx) ** 2 + (my - ny) ** 2);

    // Angles
    const yawAngle = (face.yawAngle || 0) / 90;
    const rollAngle = (face.rollAngle || 0) / 180;

    // Classification scores
    const leftEyeOpen = face.leftEyeOpenProbability || 0.5;
    const rightEyeOpen = face.rightEyeOpenProbability || 0.5;
    const smiling = face.smilingProbability || 0;

    // Build 128-float vector
    const embedding: number[] = [
      // Landmark positions (22 * 2 = 44 values)
      lex, ley,
      rex, rey,
      nx, ny,
      mx, my,
      lmx, lmy,
      rmx, rmy,
      lcx, lcy,
      rcx, rcy,
      leax, leay,
      reax, reay,
      bmx, bmy,
      // Geometric ratios (20 values)
      eyeDistance,
      eyeCenterX,
      eyeCenterY,
      noseToMouth,
      faceAspectRatio,
      eyeToNoseX,
      eyeToNoseY,
      leftEyeToNose,
      rightEyeToNose,
      eyeSymmetry,
      mouthWidth,
      mouthToNose,
      eyeDistance / Math.max(mouthWidth, 0.001),
      leftEyeToNose / Math.max(mouthWidth, 0.001),
      (ny - eyeCenterY) / Math.max(bh, 1),
      (mx - eyeCenterX) / Math.max(bw, 1),
      Math.abs(lex - 0.5) + Math.abs(rex - 0.5),
      (lcy + rcy) / 2,
      (lcx - rcx),
      eyeDistance / Math.max(faceAspectRatio, 0.001),
      // Pose and expression (14 values)
      yawAngle,
      rollAngle,
      leftEyeOpen,
      rightEyeOpen,
      smiling,
      leftEyeOpen - rightEyeOpen,
      Math.abs(yawAngle),
      Math.abs(rollAngle),
      Math.cos(yawAngle * Math.PI),
      Math.sin(yawAngle * Math.PI),
      Math.cos(rollAngle * Math.PI),
      Math.sin(rollAngle * Math.PI),
      (leftEyeOpen + rightEyeOpen) / 2,
      smiling * eyeDistance,
      // Padding to reach 128 (50 values)
      ...this.computeGeometricDescriptor(face, bw, bh),
    ].slice(0, 128);

    // Pad to exactly 128 if needed
    while (embedding.length < 128) {
      embedding.push(0);
    }

    // L2 normalize
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => (norm > 0 ? v / norm : 0));
  }

  private computeGeometricDescriptor(
    face: DetectedFace,
    bw: number,
    bh: number
  ): number[] {
    const landmarks = [
      face.leftEyePosition,
      face.rightEyePosition,
      face.noseBasePosition,
      face.mouthPosition,
      face.leftMouthPosition,
      face.rightMouthPosition,
      face.leftCheekPosition,
      face.rightCheekPosition,
    ].filter(Boolean) as { x: number; y: number }[];

    const descriptor: number[] = [];

    // Pairwise distances between all landmarks (normalized)
    for (let i = 0; i < landmarks.length; i++) {
      for (let j = i + 1; j < landmarks.length; j++) {
        const dx = (landmarks[i].x - landmarks[j].x) / Math.max(bw, 1);
        const dy = (landmarks[i].y - landmarks[j].y) / Math.max(bh, 1);
        descriptor.push(Math.sqrt(dx * dx + dy * dy));
        if (descriptor.length >= 50) break;
      }
      if (descriptor.length >= 50) break;
    }

    // Pad to 50
    while (descriptor.length < 50) {
      descriptor.push(0);
    }

    return descriptor.slice(0, 50);
  }

  /**
   * Validate face quality for enrollment/scanning
   */
  validateFaceQuality(
    face: DetectedFace,
    frameWidth: number,
    frameHeight: number
  ): FaceQualityResult {
    const { bounds } = face;
    const faceArea = bounds.size.width * bounds.size.height;
    const frameArea = frameWidth * frameHeight;
    const faceSizeRatio = faceArea / frameArea;

    // Check face size
    if (faceSizeRatio < this.MIN_FACE_SIZE) {
      return { valid: false, reason: 'Move closer to the camera' };
    }

    if (faceSizeRatio > 0.65) {
      return { valid: false, reason: 'Move farther from the camera' };
    }

    // Check face position (must be roughly centered)
    const faceCenterX = bounds.origin.x + bounds.size.width / 2;
    const faceCenterY = bounds.origin.y + bounds.size.height / 2;
    const offsetX = Math.abs(faceCenterX / frameWidth - 0.5);
    const offsetY = Math.abs(faceCenterY / frameHeight - 0.5);

    if (offsetX > 0.25) {
      return {
        valid: false,
        reason: faceCenterX < frameWidth / 2 ? 'Move right' : 'Move left',
      };
    }

    if (offsetY > 0.2) {
      return {
        valid: false,
        reason: faceCenterY < frameHeight / 2 ? 'Move down' : 'Move up',
      };
    }

    // Check yaw angle (left-right rotation)
    if (face.yawAngle !== undefined && Math.abs(face.yawAngle) > this.MAX_YAW_ANGLE) {
      return {
        valid: false,
        reason: face.yawAngle > 0 ? 'Turn face left' : 'Turn face right',
      };
    }

    // Check roll angle (tilt)
    if (face.rollAngle !== undefined && Math.abs(face.rollAngle) > this.MAX_ROLL_ANGLE) {
      return {
        valid: false,
        reason: face.rollAngle > 0 ? 'Tilt head left' : 'Tilt head right',
      };
    }

    // Check eye open
    const avgEyeOpen =
      ((face.leftEyeOpenProbability || 0) + (face.rightEyeOpenProbability || 0)) / 2;
    if (avgEyeOpen < 0.5) {
      return { valid: false, reason: 'Please open your eyes' };
    }

    return { valid: true, reason: 'Face looks good!' };
  }

  /**
   * Check liveness based on a sequence of face frames
   * Detects blinks as proof of liveness
   */
  checkLiveness(frames: DetectedFace[]): LivenessResult {
    if (frames.length < 5) {
      return { passed: false, reason: 'Not enough frames', score: 0 };
    }

    const eyeOpenValues = frames
      .map((f) => ({
        left: f.leftEyeOpenProbability,
        right: f.rightEyeOpenProbability,
      }))
      .filter((e) => e.left !== undefined && e.right !== undefined);

    if (eyeOpenValues.length < 3) {
      return { passed: false, reason: 'Could not detect eye movement', score: 0 };
    }

    // Look for blink: eye open -> eye closed -> eye open
    let blinkDetected = false;
    for (let i = 1; i < eyeOpenValues.length - 1; i++) {
      const prev = eyeOpenValues[i - 1];
      const curr = eyeOpenValues[i];
      const next = eyeOpenValues[i + 1];

      const prevAvg = ((prev.left || 0) + (prev.right || 0)) / 2;
      const currAvg = ((curr.left || 0) + (curr.right || 0)) / 2;
      const nextAvg = ((next.left || 0) + (next.right || 0)) / 2;

      if (prevAvg > 0.6 && currAvg < 0.4 && nextAvg > 0.5) {
        blinkDetected = true;
        break;
      }
    }

    // Check for head movement variation
    const yawValues = frames
      .map((f) => f.yawAngle || 0)
      .filter((v) => v !== undefined);
    const yawVariance = this.computeVariance(yawValues);

    const score = (blinkDetected ? 0.6 : 0) + (yawVariance > 5 ? 0.4 : yawVariance / 5 * 0.4);

    if (score < 0.5 && !blinkDetected) {
      return {
        passed: false,
        reason: 'Liveness check failed — please blink or move your head slightly',
        score,
      };
    }

    return {
      passed: true,
      reason: 'Liveness verified',
      score: Math.min(score, 1),
    };
  }

  private computeVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  }

  /**
   * Compute guidance message based on multiple capture angles
   */
  getGuidanceForCapture(captureIndex: number): string {
    const guides = [
      'Look straight at the camera',
      'Slowly turn your head to the left',
      'Slowly turn your head to the right',
      'Tilt your head slightly up',
      'Look straight at the camera and smile',
    ];
    return guides[captureIndex] || 'Hold still';
  }

  /**
   * Debounced face detection for live scanning
   */
  shouldProcessFrame(): boolean {
    const now = Date.now();
    if (now - this.lastDetectionTime < this.DETECTION_DEBOUNCE) {
      return false;
    }
    this.lastDetectionTime = now;
    return true;
  }
}

export default new FaceRecognitionService();
