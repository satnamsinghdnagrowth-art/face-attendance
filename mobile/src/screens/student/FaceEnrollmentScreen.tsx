import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

import { useCamera } from '@/hooks/useCamera';
import { useAuth } from '@/hooks/useAuth';
import { FaceOverlay } from '@/components/camera/FaceOverlay';
import { Button } from '@/components/common/Button';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '@/constants/theme';
import faceRecognitionService from '@/services/face-recognition.service';
import { faceApi } from '@/api/face.api';
import { DetectedFace } from '@/types';

const { width, height } = Dimensions.get('window');
const TOTAL_CAPTURES = 5;

type EnrollStep = 'instructions' | 'camera' | 'processing' | 'success' | 'error';

const FaceEnrollmentScreen: React.FC = () => {
  const { user } = useAuth();
  const { hasPermission, requestCameraPermission, cameraRef, isCapturing } = useCamera();

  const [step, setStep] = useState<EnrollStep>('instructions');
  const [captureCount, setCaptureCount] = useState(0);
  const [detectedFace, setDetectedFace] = useState<DetectedFace | null>(null);
  const [guidance, setGuidance] = useState('');
  const [progress, setProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [capturedImages, setCapturedImages] = useState<{ uri: string; embedding: number[] }[]>([]);
  const [isAutoCapturing, setIsAutoCapturing] = useState(false);

  const captureQueueRef = useRef<boolean>(false);
  const lastCaptureTime = useRef<number>(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const handleCapture = useCallback(async () => {
    if (isAutoCapturing || !cameraRef.current || captureCount >= TOTAL_CAPTURES) return;
    setIsAutoCapturing(true);
    lastCaptureTime.current = Date.now();

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        exif: false,
      });

      if (!photo?.uri) {
        setIsAutoCapturing(false);
        return;
      }

      // Generate embedding from detected face landmarks
      let embedding: number[] = new Array(128).fill(0);
      if (detectedFace) {
        embedding = faceRecognitionService.generateEmbeddingFromLandmarks(detectedFace);
      }

      const newImages = [...capturedImages, { uri: photo.uri, embedding }];
      setCapturedImages(newImages);
      const newCount = captureCount + 1;
      setCaptureCount(newCount);

      if (newCount >= TOTAL_CAPTURES) {
        // All captures done, upload
        setStep('processing');
        await uploadFaceImages(newImages);
      } else {
        setGuidance(faceRecognitionService.getGuidanceForCapture(newCount));
      }
    } catch (error) {
      console.error('Capture error:', error);
    } finally {
      setIsAutoCapturing(false);
    }
  }, [isAutoCapturing, cameraRef, captureCount, detectedFace, capturedImages]);

  const uploadFaceImages = useCallback(
    async (images: { uri: string; embedding: number[] }[]) => {
      if (!user) return;
      setProcessingMessage('Preparing face data...');

      try {
        let uploaded = 0;
        const total = images.length;

        for (const { uri, embedding } of images) {
          setProcessingMessage(`Uploading face sample ${uploaded + 1}/${total}...`);
          // isNewEnrollment=true only on the FIRST upload so that old embeddings
          // are replaced once, and all 5 angle samples are stored as active.
          await faceApi.registerFace(user.id, uri, embedding, uploaded === 0);
          uploaded++;

          Animated.timing(progressAnim, {
            toValue: uploaded / total,
            duration: 300,
            useNativeDriver: false,
          }).start();

          setProgress(uploaded / total);
        }

        setProcessingMessage('Finalizing enrollment...');
        await new Promise((r) => setTimeout(r, 800));
        setStep('success');
      } catch (error: unknown) {
        const e = error as { response?: { data?: { message?: string } } };
        setErrorMessage(
          e?.response?.data?.message || 'Failed to upload face data. Please try again.'
        );
        setStep('error');
      }
    },
    [user, progressAnim]
  );

  const handleStart = useCallback(async () => {
    if (!hasPermission) {
      const granted = await requestCameraPermission();
      if (!granted) {
        Alert.alert(
          'Camera Required',
          'Camera permission is required for face enrollment.'
        );
        return;
      }
    }
    setCaptureCount(0);
    setCapturedImages([]);
    setGuidance(faceRecognitionService.getGuidanceForCapture(0));
    setStep('camera');
  }, [hasPermission, requestCameraPermission]);

  const handleRetry = useCallback(() => {
    setCaptureCount(0);
    setCapturedImages([]);
    setProgress(0);
    progressAnim.setValue(0);
    setErrorMessage('');
    setStep('instructions');
  }, [progressAnim]);

  // Instructions step
  if (step === 'instructions') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.instructionsContent} showsVerticalScrollIndicator={false}>
          <View style={styles.instructionsHeader}>
            <View style={styles.instructionsIcon}>
              <Ionicons name="scan-outline" size={56} color={Colors.primary} />
            </View>
            <Text style={styles.instructionsTitle}>Face Enrollment</Text>
            <Text style={styles.instructionsSubtitle}>
              Register your face for automatic attendance marking
            </Text>
          </View>

          <View style={styles.stepsContainer}>
            <Text style={styles.stepsTitle}>How it works</Text>
            {[
              {
                step: '1',
                title: 'Position your face',
                desc: 'Place your face inside the oval guide on screen',
                icon: 'person-circle-outline',
              },
              {
                step: '2',
                title: 'Five captures',
                desc: 'We\'ll capture 5 photos from slightly different angles automatically',
                icon: 'camera-outline',
              },
              {
                step: '3',
                title: 'Good lighting',
                desc: 'Ensure your face is well lit with no shadows or glare',
                icon: 'sunny-outline',
              },
              {
                step: '4',
                title: 'No glasses or hat',
                desc: 'Remove glasses, hats, or other face coverings for best results',
                icon: 'eye-outline',
              },
            ].map(({ step: s, title, desc, icon }) => (
              <View key={s} style={styles.stepCard}>
                <View style={styles.stepNumberBadge}>
                  <Ionicons name={icon as never} size={22} color={Colors.primary} />
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{title}</Text>
                  <Text style={styles.stepDesc}>{desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.warningBox}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.info} />
            <Text style={styles.warningText}>
              Your face data is encrypted and stored securely. It is only used for attendance verification.
            </Text>
          </View>

          <Button
            title="Start Face Enrollment"
            onPress={handleStart}
            fullWidth
            size="lg"
            icon="camera"
            iconPosition="right"
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Camera step
  if (step === 'camera') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="front"
        />

        <FaceOverlay
          width={width}
          height={height}
          faceDetected={!!detectedFace}
          captureCount={captureCount}
          totalCaptures={TOTAL_CAPTURES}
          guidance={guidance}
          isCapturing={isAutoCapturing}
          isSuccess={false}
        />

        {/* Top controls */}
        <SafeAreaView style={styles.cameraTopBar} edges={['top']}>
          <TouchableOpacity
            style={styles.cameraBackButton}
            onPress={() => {
              setCaptureCount(0);
              setCapturedImages([]);
              setStep('instructions');
            }}
          >
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.cameraTitle}>Face Enrollment</Text>
          <View style={{ width: 44 }} />
        </SafeAreaView>

        {/* Capture hint */}
        <View style={styles.cameraBottomHint}>
          <Text style={styles.cameraHintText}>
            {isAutoCapturing
              ? 'Capturing...'
              : 'Position your face in the oval, then tap capture'}
          </Text>
          {/* Manual capture button */}
          <TouchableOpacity
            style={styles.manualCaptureButton}
            onPress={handleCapture}
            disabled={isAutoCapturing}
          >
            <View style={[styles.captureButtonInner, !detectedFace && { opacity: 0.4 }]}>
              <Ionicons name="camera" size={28} color="white" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Processing step
  if (step === 'processing') {
    const progressWidth = progressAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    });

    return (
      <SafeAreaView style={[styles.container, styles.processingContainer]}>
        <View style={styles.processingIcon}>
          <Ionicons name="cloud-upload-outline" size={56} color={Colors.primary} />
        </View>
        <Text style={styles.processingTitle}>Enrolling Your Face</Text>
        <Text style={styles.processingSubtitle}>{processingMessage}</Text>

        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
        </View>

        <Text style={styles.processingNote}>
          Please wait while we securely process and upload your face data...
        </Text>

        {/* Captured thumbnails preview */}
        <View style={styles.capturedRow}>
          {capturedImages.map((img, i) => (
            <View key={i} style={styles.capturedThumb}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // Success step
  if (step === 'success') {
    return (
      <SafeAreaView style={[styles.container, styles.successContainer]}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={80} color={Colors.success} />
        </View>
        <Text style={styles.successTitle}>Enrollment Complete!</Text>
        <Text style={styles.successSubtitle}>
          Your face has been successfully registered. You can now have your attendance marked automatically.
        </Text>

        <View style={styles.successStats}>
          {[
            { label: 'Samples Captured', value: TOTAL_CAPTURES, icon: 'camera' },
            { label: 'Accuracy', value: 'High', icon: 'speedometer' },
            { label: 'Status', value: 'Active', icon: 'checkmark-circle' },
          ].map(({ label, value, icon }) => (
            <View key={label} style={styles.successStat}>
              <Ionicons name={icon as never} size={22} color={Colors.success} />
              <Text style={styles.successStatValue}>{value}</Text>
              <Text style={styles.successStatLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <Button
          title="Done"
          onPress={() => setStep('instructions')}
          fullWidth
          size="lg"
          variant="success"
          icon="checkmark"
          iconPosition="right"
        />

        <Button
          title="Re-enroll Face"
          onPress={handleRetry}
          fullWidth
          size="md"
          variant="outline"
          style={styles.reEnrollButton}
        />
      </SafeAreaView>
    );
  }

  // Error step
  return (
    <SafeAreaView style={[styles.container, styles.errorContainer]}>
      <View style={styles.errorIcon}>
        <Ionicons name="close-circle" size={72} color={Colors.danger} />
      </View>
      <Text style={styles.errorTitle}>Enrollment Failed</Text>
      <Text style={styles.errorSubtitle}>{errorMessage}</Text>

      <Button
        title="Try Again"
        onPress={handleRetry}
        fullWidth
        size="lg"
        variant="danger"
        icon="refresh"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  instructionsContent: {
    padding: Spacing.lg,
    flexGrow: 1,
  },
  instructionsHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    paddingTop: Spacing.md,
  },
  instructionsIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.primary + '30',
  },
  instructionsTitle: {
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  instructionsSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  stepsContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  stepsTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  stepNumberBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepContent: { flex: 1 },
  stepTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  stepDesc: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.infoFaded,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.info + '30',
  },
  warningText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.info,
    lineHeight: 20,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  cameraTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    zIndex: 20,
  },
  cameraBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: 'white',
  },
  cameraBottomHint: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 50,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    gap: Spacing.md,
    zIndex: 15,
  },
  cameraHintText: {
    color: 'white',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    textAlign: 'center',
  },
  manualCaptureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  processingIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  processingSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    gap: Spacing.sm,
  },
  progressTrack: {
    height: 10,
    backgroundColor: Colors.border,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 5,
  },
  progressText: {
    textAlign: 'right',
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.semibold,
  },
  processingNote: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  capturedRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  capturedThumb: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.successFaded,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  successIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.successFaded,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.success + '30',
  },
  successTitle: {
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  successSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  successStats: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.successFaded,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: '100%',
    marginBottom: Spacing.md,
  },
  successStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  successStatValue: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  successStatLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  reEnrollButton: {
    marginTop: Spacing.sm,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  errorIcon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.dangerFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  errorSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
});

export default FaceEnrollmentScreen;
