import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { useCamera } from '@/hooks/useCamera';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { addScanResult, endSessionThunk } from '@/store/slices/attendance.slice';
import { ScanResultOverlay } from '@/components/camera/ScanResultOverlay';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '@/constants/theme';
import faceRecognitionService from '@/services/face-recognition.service';
import { faceApi } from '@/api/face.api';
import { attendanceApi } from '@/api/attendance.api';
import { userApi } from '@/api/user.api';
import { StatusBadge } from '@/components/common/StatusBadge';
import { TeacherStackParamList } from '@/navigation/types';
import { ScanResult, DetectedFace, AttendanceStatus, User } from '@/types';
import { formatSessionTimer } from '@/utils/helpers';

const { width, height } = Dimensions.get('window');

type LiveScanRoute = RouteProp<TeacherStackParamList, 'LiveScan'>;

const SCAN_COOLDOWN = 5000;

const LiveScanScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<LiveScanRoute>();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { cameraRef, hasPermission, requestCameraPermission } = useCamera();
  const { currentSession, scanResults, isSessionLoading } = useAppSelector((state) => state.attendance);

  const sessionId = route.params?.sessionId || currentSession?.id || '';

  const [detectedFace, setDetectedFace] = useState<DetectedFace | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<ScanResult | null>(null);
  const [boundingBox, setBoundingBox] = useState<{ x: number; y: number; width: number; height: number } | undefined>();
  const [timer, setTimer] = useState('00:00');
  const [manualMode, setManualMode] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [classStudents, setClassStudents] = useState<User[]>([]);
  const [markedStudents, setMarkedStudents] = useState<Record<string, AttendanceStatus>>({});
  const [isMarkingId, setIsMarkingId] = useState<string | null>(null);

  const lastScanTime = useRef<number>(0);
  const isScanningRef = useRef(false);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Request camera permission
  useEffect(() => {
    if (!hasPermission) {
      requestCameraPermission();
    }
  }, [hasPermission, requestCameraPermission]);

  // Session timer
  useEffect(() => {
    if (!currentSession?.start_time) return;
    timerInterval.current = setInterval(() => {
      setTimer(formatSessionTimer(currentSession.start_time));
    }, 1000);
    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
    };
  }, [currentSession?.start_time]);

  // Fetch enrolled students for manual marking
  useEffect(() => {
    const classId = currentSession?.class_id;
    if (!classId) return;
    userApi.getClassStudents(classId, { limit: 100 })
      .then((res) => setClassStudents(res.data.data))
      .catch(() => {});
  }, [currentSession?.class_id]);

  const handleScan = useCallback(
    async (faceToScan?: DetectedFace) => {
      if (isScanningRef.current || !sessionId || !cameraRef.current) return;

      const now = Date.now();
      if (now - lastScanTime.current < SCAN_COOLDOWN) return;

      isScanningRef.current = true;
      setIsScanning(true);
      lastScanTime.current = now;

      try {
        // Capture photo
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.7,
          base64: false,
          exif: false,
        });

        if (!photo?.uri) {
          setIsScanning(false);
          isScanningRef.current = false;
          return;
        }

        // Use face landmarks if available (SDK 51 camera detection), else zero vector
        const embedding = faceToScan
          ? faceRecognitionService.generateEmbeddingFromLandmarks(faceToScan)
          : new Array(128).fill(0);

        // Call API
        const response = await faceApi.scanForAttendance(sessionId, photo.uri, embedding);
        const scanData = response.data.data;

        if (scanData.success && scanData.student_id) {
          const result: ScanResult = {
            student: {
              id: scanData.student_id,
              name: scanData.student_name || 'Unknown',
              email: '',
              role: 'student',
            },
            confidence: scanData.confidence || 0,
            status: (scanData.status as AttendanceStatus) || 'present',
            record_id: scanData.record_id,
            scanned_at: new Date().toISOString(),
          };

          dispatch(addScanResult(result));
          setLastScanResult(result);
          setScanCount((c) => c + 1);
        } else {
          // Unknown face result
          setLastScanResult({
            student: { id: 'unknown', name: 'Unknown Face', email: '', role: 'student' },
            confidence: 0,
            status: 'absent',
            scanned_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.warn('[LiveScan] Scan error:', error);
        setLastScanResult({
          student: { id: 'error', name: 'Scan Failed', email: '', role: 'student' },
          confidence: 0,
          status: 'absent',
          scanned_at: new Date().toISOString(),
        });
      } finally {
        setIsScanning(false);
        isScanningRef.current = false;
      }
    },
    [detectedFace, sessionId, cameraRef, dispatch]
  );

  const handleManualMark = useCallback(async (studentId: string, status: AttendanceStatus) => {
    if (!sessionId) return;
    try {
      await attendanceApi.manualMark(sessionId, studentId, status);
      Alert.alert('Success', 'Attendance marked manually');
    } catch {
      Alert.alert('Error', 'Failed to mark attendance manually');
    }
  }, [sessionId]);

  const handleManualMarkStudent = useCallback(async (student: User, status: AttendanceStatus) => {
    if (!sessionId || isMarkingId) return;
    setIsMarkingId(student.id);
    try {
      await attendanceApi.manualMark(sessionId, student.id, status);
      setMarkedStudents((prev) => ({ ...prev, [student.id]: status }));
      setScanCount((c) => c + 1);
      const result: ScanResult = {
        student,
        confidence: 1,
        status,
        scanned_at: new Date().toISOString(),
      };
      dispatch(addScanResult(result));
      setLastScanResult(result);
    } catch {
      Alert.alert('Error', `Failed to mark ${student.name}`);
    } finally {
      setIsMarkingId(null);
    }
  }, [sessionId, isMarkingId, dispatch]);

  const handleEndSession = useCallback(() => {
    Alert.alert(
      'End Session',
      `End session with ${scanCount} students scanned?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            if (currentSession) {
              await dispatch(endSessionThunk(currentSession.id));
            }
            navigation.goBack();
          },
        },
      ]
    );
  }, [currentSession, dispatch, navigation, scanCount]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={56} color={Colors.textMuted} />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          Camera permission is needed for face recognition scanning
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!sessionId) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Ionicons name="alert-circle-outline" size={56} color={Colors.warning} />
        <Text style={styles.permissionTitle}>No Active Session</Text>
        <Text style={styles.permissionText}>
          Please start an attendance session first
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={() => navigation.navigate('StartAttendance' as never)}
        >
          <Text style={styles.permissionButtonText}>Start Session</Text>
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
        facing="front"
        onCameraReady={() => setCameraReady(true)}
      />

      {/* Scan result overlay with bounding box */}
      <ScanResultOverlay
        result={lastScanResult}
        isScanning={isScanning}
        boundingBox={boundingBox}
        cameraWidth={width}
        cameraHeight={height}
      />

      {/* Top bar */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>

        <View style={styles.sessionInfo}>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <Text style={styles.sessionTimer}>{timer}</Text>
        </View>

        <TouchableOpacity style={styles.endButton} onPress={handleEndSession}>
          <Text style={styles.endButtonText}>End</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Stats overlay */}
      <View style={styles.statsOverlay}>
        <View style={styles.statBadge}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
          <Text style={styles.statBadgeText}>{scanResults.filter(r => r.status === 'present').length} Present</Text>
        </View>
        <View style={styles.statBadge}>
          <Ionicons name="scan" size={16} color={Colors.primaryLight} />
          <Text style={styles.statBadgeText}>{scanCount} Scanned</Text>
        </View>
        <TouchableOpacity
          style={[styles.statBadge, styles.manualButton]}
          onPress={() => setManualMode(!manualMode)}
        >
          <Ionicons name="create-outline" size={16} color={Colors.warning} />
          <Text style={[styles.statBadgeText, { color: Colors.warning }]}>Manual</Text>
        </TouchableOpacity>
      </View>

      {/* Scan button */}
      <View style={styles.scanButtonContainer}>
        <TouchableOpacity
          style={[styles.scanButton, (!cameraReady || isScanning) && styles.scanButtonDisabled]}
          onPress={() => handleScan()}
          disabled={!cameraReady || isScanning}
        >
          <Ionicons name="scan" size={32} color="white" />
          <Text style={styles.scanButtonText}>
            {!cameraReady ? 'Camera loading...' : isScanning ? 'Scanning...' : 'Tap to Scan'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Side panel: recent scan results (hidden when manual mode is open) */}
      {scanResults.length > 0 && !manualMode && (
        <View style={styles.resultsPanel}>
          <Text style={styles.resultsPanelTitle}>Recent Scans</Text>
          <FlatList
            data={scanResults.slice(0, 6)}
            keyExtractor={(item, i) => `${item.student.id}-${i}`}
            renderItem={({ item }) => (
              <View style={styles.resultItem}>
                <View style={styles.resultDot} />
                <Text style={styles.resultName} numberOfLines={1}>{item.student.name}</Text>
                <StatusBadge status={item.status} size="sm" showIcon={false} />
              </View>
            )}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {/* Manual attendance panel */}
      {manualMode && (
        <View style={styles.manualPanel}>
          <View style={styles.manualPanelHeader}>
            <Text style={styles.manualPanelTitle}>Manual Attendance</Text>
            <TouchableOpacity onPress={() => setManualMode(false)}>
              <Ionicons name="close" size={22} color="white" />
            </TouchableOpacity>
          </View>
          {classStudents.length === 0 ? (
            <Text style={styles.manualEmpty}>No students enrolled in this class</Text>
          ) : (
            <FlatList
              data={classStudents}
              keyExtractor={(s) => s.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: student }) => {
                const marked = markedStudents[student.id];
                const isLoading = isMarkingId === student.id;
                return (
                  <View style={styles.manualStudentRow}>
                    <View style={styles.manualStudentAvatar}>
                      <Text style={styles.manualStudentInitial}>
                        {student.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.manualStudentName} numberOfLines={1}>{student.name}</Text>
                    {marked ? (
                      <View style={[styles.markedBadge, marked === 'present' ? styles.markedPresent : styles.markedAbsent]}>
                        <Text style={styles.markedBadgeText}>
                          {marked === 'present' ? '✓ Present' : '✗ Absent'}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.manualButtons}>
                        <TouchableOpacity
                          style={[styles.manualBtn, styles.manualBtnPresent, isLoading && styles.manualBtnDisabled]}
                          onPress={() => handleManualMarkStudent(student, 'present')}
                          disabled={!!isMarkingId}
                        >
                          <Text style={styles.manualBtnText}>✓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.manualBtn, styles.manualBtnAbsent, isLoading && styles.manualBtnDisabled]}
                          onPress={() => handleManualMarkStudent(student, 'absent')}
                          disabled={!!isMarkingId}
                        >
                          <Text style={styles.manualBtnText}>✗</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      )}
    </View>
  );
};

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
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 30,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.danger + 'CC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'white',
  },
  liveText: {
    color: 'white',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    letterSpacing: 1,
  },
  sessionTimer: {
    color: 'white',
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    fontVariant: ['tabular-nums'],
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
  statsOverlay: {
    position: 'absolute',
    top: 100,
    left: Spacing.md,
    gap: Spacing.sm,
    zIndex: 20,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    gap: 5,
  },
  statBadgeText: {
    color: 'white',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  manualButton: {
    borderWidth: 1,
    borderColor: Colors.warning + '60',
  },
  scanButtonContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
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
  resultsPanel: {
    position: 'absolute',
    right: 0,
    top: 100,
    bottom: 120,
    width: 140,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderTopLeftRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.lg,
    padding: Spacing.sm,
    zIndex: 20,
  },
  resultsPanelTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 6,
  },
  resultDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
    flexShrink: 0,
  },
  resultName: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: 'white',
    fontWeight: FontWeights.medium,
  },
  // Manual panel
  manualPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '60%',
    backgroundColor: 'rgba(15,23,42,0.97)',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.md,
    zIndex: 40,
  },
  manualPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  manualPanelTitle: {
    color: 'white',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  manualEmpty: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: FontSizes.sm,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  manualStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: Spacing.sm,
  },
  manualStudentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  manualStudentInitial: {
    color: Colors.primaryLight,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  manualStudentName: {
    flex: 1,
    color: 'white',
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  manualButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  manualBtn: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualBtnPresent: { backgroundColor: Colors.success },
  manualBtnAbsent: { backgroundColor: Colors.danger },
  manualBtnDisabled: { opacity: 0.4 },
  manualBtnText: { color: 'white', fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  markedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  markedPresent: { backgroundColor: Colors.success + '30', borderWidth: 1, borderColor: Colors.success },
  markedAbsent: { backgroundColor: Colors.danger + '30', borderWidth: 1, borderColor: Colors.danger },
  markedBadgeText: { color: 'white', fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
});

export default LiveScanScreen;
