import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { attendanceApi } from '@/api/attendance.api';
import { AttendanceStatus } from '@/types';

interface OfflineRecord {
  id: string;
  session_id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  status: AttendanceStatus;
  marked_at: string;
  synced: boolean;
  created_at: string;
}

const STORAGE_KEY = 'offline_attendance_queue';

class OfflineService {
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  private async readQueue(): Promise<OfflineRecord[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as OfflineRecord[]) : [];
    } catch {
      return [];
    }
  }

  private async writeQueue(records: OfflineRecord[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  async saveOfflineRecord(
    record: Omit<OfflineRecord, 'synced' | 'created_at'>
  ): Promise<void> {
    try {
      const queue = await this.readQueue();
      const exists = queue.findIndex((r) => r.id === record.id);
      const entry: OfflineRecord = {
        ...record,
        synced: false,
        created_at: new Date().toISOString(),
      };
      if (exists >= 0) {
        queue[exists] = entry;
      } else {
        queue.push(entry);
      }
      await this.writeQueue(queue);
      console.log('[OfflineService] Saved offline record:', record.id);
    } catch (error) {
      console.error('[OfflineService] Failed to save record:', error);
    }
  }

  async getSyncQueue(): Promise<OfflineRecord[]> {
    const queue = await this.readQueue();
    return queue.filter((r) => !r.synced).slice(0, 50);
  }

  async syncWithServer(): Promise<{ synced: number; failed: number }> {
    const pending = await this.getSyncQueue();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;
    const syncedIds: string[] = [];

    for (const record of pending) {
      try {
        await attendanceApi.manualMark(
          record.session_id,
          record.student_id,
          record.status
        );
        syncedIds.push(record.id);
        synced++;
      } catch (error) {
        console.warn(
          '[OfflineService] Failed to sync record:',
          record.id,
          error
        );
        failed++;
      }
    }

    if (syncedIds.length > 0) {
      await this.clearSynced(syncedIds);
    }

    console.log(
      `[OfflineService] Sync complete: ${synced} synced, ${failed} failed`
    );
    return { synced, failed };
  }

  async clearSynced(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const queue = await this.readQueue();
      const updated = queue.map((r) =>
        ids.includes(r.id) ? { ...r, synced: true } : r
      );
      // Keep only unsynced + last 200 synced records to avoid unbounded growth
      const unsynced = updated.filter((r) => !r.synced);
      const recentSynced = updated.filter((r) => r.synced).slice(-200);
      await this.writeQueue([...unsynced, ...recentSynced]);
    } catch (error) {
      console.error('[OfflineService] Failed to clear synced records:', error);
    }
  }

  async getOfflineCount(): Promise<number> {
    const queue = await this.readQueue();
    return queue.filter((r) => !r.synced).length;
  }

  async clearAllSynced(): Promise<void> {
    try {
      const queue = await this.readQueue();
      await this.writeQueue(queue.filter((r) => !r.synced));
    } catch (error) {
      console.error('[OfflineService] Failed to clear synced records:', error);
    }
  }

  initialize(): void {
    this.startBackgroundSync();
    console.log('[OfflineService] Initialized with AsyncStorage backend');
  }

  private startBackgroundSync(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (state.isConnected && state.isInternetReachable) {
          const count = await this.getOfflineCount();
          if (count > 0) {
            console.log(
              `[OfflineService] Background sync: ${count} pending records`
            );
            await this.syncWithServer();
          }
        }
      } catch {
        // silently skip — network check failed
      }
    }, 60000);
  }

  stopBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export default new OfflineService();
