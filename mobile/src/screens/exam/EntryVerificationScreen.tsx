import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { useCamera } from '@/hooks/useCamera';
import { examApi } from '@/api/exam.api';
import { VerificationResult } from '@/api/exam.api';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

type RouteParams = {
  sessionId: string;
  examId: string;
  hallId: string;
  studentId?: string;
  studentName?: string;
  seatNumber?: string;
  rollNumber?: string;
};

type VerdictType = 'verified' | 'flagged' | 'rejected' | 'proxy_suspect' | null;

const verdictConfig: Record<
  Exclude<VerdictType, null>,
  { bg: string; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }
> = {
  verified: {
    bg: 'rgba(22,163,74,0.88)',
    icon: 'checkmark-circle',
    title: 'VERIFIED',
    subtitle: 'Entry Approved',
  },
  flagged: {
    bg: 'rgba(217,119,6,0.88)',
    icon: 'flag',
    title: 'FLAGGED',
    subtitle: 'ID Verification Required',
  },
  rejected: {
    bg: 'rgba(220,38,38,0.88)',
    icon: 'close-circle',
    title: 'REJECTED',
    subtitle: 'Entry Denied',
  },
  proxy_suspect: {
    bg: 'rgba(220,38,38,0.88)',
    icon: 'person-remove',
    title: 'PROXY SUSPECTED',
    subtitle: 'Alert Escalated to Examiner',
  },
};

const EntryVerificationScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<Record<string, RouteParams>, string>>();
  const { sessionId, examId, hallId, studentId, studentName, seatNumber, rollNumber } =
    route.params || {};

  const { cameraRef, hasPermission, requestCameraPermission } = useCamera();

  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [cameraReady, setCameraReady] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [verdictResult, setVerdictResult] = useState<VerificationResult | null>(null);
  const [idCardMode, setIdCardMode] = useState(false);
  const [idCardUri, setIdCardUri] = useState<string | null>(null);

  const isScanningRef = useRef(false);
  const verdictAnim = useRef(new Animated.Value(0)).current;
  const verdictTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasPermission) {
      requestCameraPermission();
    }
    return () => {
      if (verdictTimeout.current) clearTimeout(verdictTimeout.current);
    };
  }, [hasPermission, requestCameraPermission]);

  const showVerdictOverlay = useCallback(
    (result: VerificationResult) => {
      setVerdictResult(result);
      Animated.sequence([
        Animated.timing(verdictAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(2600),
        Animated.timing(verdictAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setVerdictResult(null);
        const v = result.verdict;
        if (v === 'verified') {
          navigation.navigate('Students' as never);
        }
      });
    },
    [verdictAnim, navigation]
  );

  const handleScan = useCallback(async () => {
    if (isScanningRef.current || !cameraRef.current || !cameraReady) return;

    // Guard: session must be active before scanning
    if (!sessionId) {
      Alert.alert(
        'No Active Session',
        'Please start a hall session first before scanning students.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      return;
    }

    // Guard: a student must be selected
    if (!studentId) {
      Alert.alert(
        'No Student Selected',
        'Please go back to the Students list and tap a student name to begin verification.',
        [{ text: 'Go to Students', onPress: () => navigation.navigate('Students' as never) }]
      );
      return;
    }

    isScanningRef.current = true;
    setIsScanning(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
        exif: false,
      });

      if (!photo?.uri) {
        Alert.alert('Camera Error', 'Failed to capture photo. Please try again.');
        return;
      }

      const formData = new FormData();
      formData.append('face_image', {
        uri: photo.uri,
        type: 'image/jpeg',
        name: 'face.jpg',
      } as any);
      formData.append('exam_session_id', sessionId);
      formData.append('student_id', studentId);
      formData.append('scan_type', 'entry');
      // Send a zero-vector embedding; the backend prefers server-side embedding from the image
      formData.append('embedding', JSON.stringify(new Array(128).fill(0)));

      if (idCardMode && idCardUri) {
        formData.append('id_card_image', {
          uri: idCardUri,
          type: 'image/jpeg',
          name: 'id_card.jpg',
        } as any);
      }

      const res = await examApi.verifyEntry(formData);
      const result: VerificationResult = res.data?.data || res.data;
      showVerdictOverlay(result);
    } catch (e: unknown) {
      // Extract the actual error message from axios 400/500 responses
      const axiosErr = e as { response?: { data?: { message?: string; errors?: Array<{ message: string }> } }; message?: string };
      const serverMsg =
        axiosErr?.response?.data?.message ||
        axiosErr?.response?.data?.errors?.[0]?.message ||
        axiosErr?.message;

      if (serverMsg?.includes('exam_session_id') || serverMsg?.includes('session')) {
        Alert.alert('Session Error', 'No active session found. Please start a hall session first.');
      } else if (serverMsg?.includes('student_id') || serverMsg?.includes('student')) {
        Alert.alert('Student Error', 'Student information is missing. Please select a student from the list.');
      } else {
        Alert.alert('Scan Failed', serverMsg || 'Unable to verify. Please try again.');
      }
    } finally {
      setIsScanning(false);
      isScanningRef.current = false;
    }
  }, [sessionId, studentId, cameraRef, cameraReady, idCardMode, idCardUri, showVerdictOverlay, navigation]);

  const handleCaptureIdCard = useCallback(async () => {
    if (!cameraRef.current || !cameraReady) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        exif: false,
      });
      if (photo?.uri) {
        setIdCardUri(photo.uri);
        Alert.alert('ID Captured', 'ID card photo captured. Now switch to front camera and scan.');
        setCameraFacing('front');
        setIdCardMode(false);
      }
    } catch {
      Alert.alert('Error', 'Failed to capture ID card');
    }
  }, [cameraRef, cameraReady]);

  const flipCamera = useCallback(() => {
    setCameraReady(false);
    setCameraFacing((f) => {
      const next = f === 'front' ? 'back' : 'front';
      setIdCardMode(next === 'back');
      return next;
    });
  }, []);

  const currentVerdict = verdictResult
    ? ((verdictResult.verdict) as VerdictType)
    : null;
  const verdictCfg = currentVerdict ? verdictConfig[currentVerdict] : null;

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.permissionContainer} edges={['top']}>
        <Ionicons name="camera-outline" size={56} color={Colors.textMuted} />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>Camera permission is needed for entry verification</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={cameraFacing}
        onCameraReady={() => setCameraReady(true)}
      />

      {/* Verdict overlay */}
      {verdictResult && verdictCfg && (
        <Animated.View
          style={[styles.verdictOverlay, { backgroundColor: verdictCfg.bg, opacity: verdictAnim }]}
        >
          <Ionicons name={verdictCfg.icon} size={72} color="white" />
          <Text style={styles.verdictTitle}>{verdictCfg.title}</Text>
          <Text style={styles.verdictSubtitle}>{verdictCfg.subtitle}</Text>
          {verdictResult.expected_student?.name && (
            <Text style={styles.verdictName}>{verdictResult.expected_student?.name}</Text>
          )}
          {verdictResult.confidence_score !== undefined && (
            <View style={styles.confidencePill}>
              <Text style={styles.confidenceText}>
                {Math.round((verdictResult.confidence_score || 0) * 100)}% confidence
              </Text>
            </View>
          )}

          {/* ID card capture prompt for flagged */}
          {currentVerdict === 'flagged' && (
            <TouchableOpacity
              style={styles.idCaptureBtn}
              onPress={() => {
                setCameraFacing('back');
                setIdCardMode(true);
                setVerdictResult(null);
              }}
            >
              <Ionicons name="card-outline" size={18} color="white" />
              <Text style={styles.idCaptureBtnText}>Capture ID Card</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* Top bar */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <TouchableOpacity style={styles.topBarBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>

        <View style={styles.titleBlock}>
          <Text style={styles.topBarTitle}>
            {idCardMode ? 'CAPTURE ID' : 'EXAM ENTRY'}
          </Text>
          {idCardUri && !idCardMode && (
            <View style={styles.idCapturedBadge}>
              <Ionicons name="card-outline" size={11} color={Colors.success} />
              <Text style={styles.idCapturedText}>ID Ready</Text>
            </View>
          )}
        </View>

        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.topBarBtn} onPress={flipCamera}>
            <Ionicons name="camera-reverse-outline" size={22} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.endButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.endButtonText}>End</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ID card framing overlay */}
      {idCardMode && (
        <View style={styles.idCardOverlay} pointerEvents="none">
          <View style={styles.idCardFrame}>
            <View style={[styles.idCorner, styles.idCornerTL]} />
            <View style={[styles.idCorner, styles.idCornerTR]} />
            <View style={[styles.idCorner, styles.idCornerBL]} />
            <View style={[styles.idCorner, styles.idCornerBR]} />
            <Text style={styles.idCardInstruction}>Align ID card within the frame</Text>
          </View>
        </View>
      )}

      {/* Student info panel + scan button */}
      <View style={styles.bottomPanel}>
        {(studentName || seatNumber || rollNumber) && (
          <View style={styles.studentInfoPanel}>
            <View style={styles.studentInfoLeft}>
              <Text style={styles.studentInfoLabel}>
                {idCardMode ? 'CAPTURE ID CARD' : 'ENTRY SCAN'}
              </Text>
              {studentName && (
                <Text style={styles.studentName} numberOfLines={1}>{studentName}</Text>
              )}
              <View style={styles.studentMeta}>
                {seatNumber && (
                  <Text style={styles.studentMetaText}>Seat {seatNumber}</Text>
                )}
                {rollNumber && (
                  <Text style={styles.studentMetaText}>Roll {rollNumber}</Text>
                )}
              </View>
            </View>
            {idCardUri && (
              <View style={styles.idReadyBadge}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.idReadyText}>ID</Text>
              </View>
            )}
          </View>
        )}

        {idCardMode ? (
          <TouchableOpacity
            style={[styles.scanButton, { backgroundColor: Colors.warning }, !cameraReady && styles.scanButtonDisabled]}
            onPress={handleCaptureIdCard}
            disabled={!cameraReady}
          >
            <Ionicons name="card-outline" size={28} color="white" />
            <Text style={styles.scanButtonText}>
              {cameraReady ? 'Capture ID Card' : 'Camera loading...'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.scanButton,
              (!cameraReady || isScanning || !studentId || !sessionId) && styles.scanButtonDisabled,
            ]}
            onPress={handleScan}
            disabled={!cameraReady || isScanning}
          >
            <Ionicons name="scan" size={28} color="white" />
            <Text style={styles.scanButtonText}>
              {!sessionId
                ? 'No active session'
                : !studentId
                  ? 'Select student first'
                  : !cameraReady
                    ? 'Camera loading...'
                    : isScanning
                      ? 'Verifying...'
                      : 'Scan to Verify'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const ID_FRAME_W = width * 0.78;
const ID_FRAME_H = ID_FRAME_W * 0.63;
const CORNER = 20;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },

  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
    backgroundColor: Colors.background,
  },
  permissionTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: BorderRadius.full,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 30,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    alignItems: 'center',
    gap: 3,
  },
  topBarTitle: {
    color: 'white',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    letterSpacing: 1.5,
  },
  idCapturedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.successFaded,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  idCapturedText: {
    fontSize: FontSizes.xs,
    color: Colors.success,
    fontWeight: FontWeights.semibold,
  },
  endButton: {
    backgroundColor: Colors.danger + 'CC',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
  },
  endButtonText: {
    color: 'white',
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },

  // Verdict overlay
  verdictOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    zIndex: 50,
    paddingHorizontal: Spacing.xl,
  },
  verdictTitle: {
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.extrabold,
    color: 'white',
    letterSpacing: 2,
  },
  verdictSubtitle: {
    fontSize: FontSizes.lg,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: FontWeights.semibold,
  },
  verdictName: {
    fontSize: FontSizes.xl,
    color: 'white',
    fontWeight: FontWeights.bold,
    marginTop: Spacing.sm,
  },
  confidencePill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  confidenceText: {
    color: 'white',
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  idCaptureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  idCaptureBtnText: {
    color: 'white',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },

  // ID card frame overlay
  idCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  idCardFrame: {
    width: ID_FRAME_W,
    height: ID_FRAME_H,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  idCorner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: 'white',
    borderWidth: 3,
  },
  idCornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  idCornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  idCornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  idCornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  idCardInstruction: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },

  // Bottom panel
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: Spacing.md,
    paddingBottom: 36,
    paddingTop: Spacing.md,
    gap: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  studentInfoPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  studentInfoLeft: { flex: 1 },
  studentInfoLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  studentName: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: 'white',
  },
  studentMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: 2,
  },
  studentMetaText: {
    fontSize: FontSizes.xs,
    color: 'rgba(255,255,255,0.7)',
  },
  idReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.successFaded,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  idReadyText: {
    fontSize: FontSizes.xs,
    color: Colors.success,
    fontWeight: FontWeights.bold,
  },

  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.full,
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  scanButtonDisabled: {
    backgroundColor: 'rgba(100,116,139,0.8)',
    shadowColor: 'transparent',
  },
  scanButtonText: {
    color: 'white',
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
});

export default EntryVerificationScreen;
