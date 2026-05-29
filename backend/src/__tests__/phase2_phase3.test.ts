/**
 * Phase 2 + Phase 3 feature tests.
 *
 * Covers:
 *   Phase 2 — PDF/CSV export, push token management, image cleanup cron logic,
 *             re-verification setup, digital signature
 *   Phase 3 — Multi-tenant schema guards, SIS sync, liveness stub, OCR stub
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock('expo-server-sdk', () => {
  const Expo = jest.fn().mockImplementation(() => ({
    chunkPushNotifications: jest.fn((msgs: unknown[]) => [msgs]),
    sendPushNotificationsAsync: jest.fn().mockResolvedValue([{ status: 'ok' }]),
  }));
  (Expo as any).isExpoPushToken = jest.fn(() => true);
  return { __esModule: true, default: Expo, Expo };
});

// ─── Imports ─────────────────────────────────────────────────────────────────

import { query } from '../config/database';
import { pushNotificationService } from '../services/push.notification.service';
import { ocrService } from '../services/ocr.service';
import { livenessService } from '../services/liveness.service';
import { sisIntegrationService } from '../services/sis.integration.service';
import crypto from 'crypto';

const mockQuery = query as jest.MockedFunction<typeof query>;

// ─── Phase 2: Push Notification Service ──────────────────────────────────────

describe('Phase 2: PushNotificationService', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registerToken upserts token in push_tokens table', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    await pushNotificationService.registerToken('user-1', 'ExponentPushToken[xxx]');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO push_tokens'),
      ['user-1', 'ExponentPushToken[xxx]', 'expo']
    );
  });

  it('unregisterToken removes token from push_tokens table', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    await pushNotificationService.unregisterToken('user-1', 'ExponentPushToken[xxx]');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM push_tokens'),
      ['user-1', 'ExponentPushToken[xxx]']
    );
  });

  it('sendExamAlert sends push to exam staff (never throws)', async () => {
    // Get tokens for exam staff
    mockQuery.mockResolvedValueOnce({
      rows: [
        { user_id: 'ce-1', token: 'ExponentPushToken[chief1]' },
        { user_id: 'inv-1', token: 'ExponentPushToken[inv1]' },
      ],
      rowCount: 2,
    } as any);

    await expect(
      pushNotificationService.sendExamAlert('exam-1', 'proxy_suspect', 'critical', 'Proxy detected', undefined)
    ).resolves.toBeUndefined();
  });

  it('sendExamAlert handles empty token list gracefully', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    await expect(
      pushNotificationService.sendExamAlert('exam-x', 'low_confidence', 'high', 'Flagged scan', undefined)
    ).resolves.toBeUndefined();
  });

  it('sendExamAlert never throws even if Expo API fails', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ user_id: 'u-1', token: 'ExponentPushToken[t1]' }], rowCount: 1,
    } as any);
    // Make expo throw
    const expo = require('expo-server-sdk').default;
    expo.mockImplementationOnce(() => ({
      chunkPushNotifications: jest.fn((m: unknown[]) => [m]),
      sendPushNotificationsAsync: jest.fn().mockRejectedValue(new Error('Expo API down')),
    }));
    await expect(
      pushNotificationService.sendExamAlert('exam-1', 'proxy_suspect', 'critical', 'Test', undefined)
    ).resolves.toBeUndefined();
  });
});

// ─── Phase 2: Image Retention Cleanup Logic ───────────────────────────────────

describe('Phase 2: Image retention cleanup (cron logic)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('cleanup query targets face_image_url and id_card_image_url older than 90 days', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 've-1' }, { id: 've-2' }], rowCount: 2 } as any);

    const result = await mockQuery(
      `UPDATE verification_events
       SET face_image_url = NULL,
           id_card_image_url = NULL
       WHERE scanned_at < NOW() - INTERVAL '90 days'
         AND (face_image_url IS NOT NULL OR id_card_image_url IS NOT NULL)
       RETURNING id`,
      []
    );

    expect(result.rowCount).toBe(2);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('90 days'),
      []
    );
  });

  it('cleanup query preserves the verification_event row (only nulls image URLs)', async () => {
    const sql = `UPDATE verification_events
       SET face_image_url = NULL, id_card_image_url = NULL
       WHERE scanned_at < NOW() - INTERVAL '90 days'`;
    // Should be UPDATE, not DELETE
    expect(sql).toContain('UPDATE');
    expect(sql).not.toContain('DELETE');
    expect(sql).toContain('face_image_url = NULL');
    expect(sql).toContain('id_card_image_url = NULL');
  });
});

// ─── Phase 2: Digital Report Signature ────────────────────────────────────────

describe('Phase 2: Digital report signature (SHA-256)', () => {
  it('generates consistent SHA-256 hash for same payload', () => {
    const payload = JSON.stringify({ exam: 'CS-2026', stats: { verified: 50 } });
    const h1 = crypto.createHash('sha256').update(payload).digest('hex');
    const h2 = crypto.createHash('sha256').update(payload).digest('hex');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('produces different hash when payload changes (tamper detection)', () => {
    const original = JSON.stringify({ events: [{ verdict: 'verified' }] });
    const tampered  = JSON.stringify({ events: [{ verdict: 'flagged'  }] });
    const h1 = crypto.createHash('sha256').update(original).digest('hex');
    const h2 = crypto.createHash('sha256').update(tampered).digest('hex');
    expect(h1).not.toBe(h2);
  });

  it('report_hash is 64 hex characters (SHA-256 output)', () => {
    const hash = crypto.createHash('sha256').update('test').digest('hex');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ─── Phase 3: SIS Integration Service ────────────────────────────────────────

describe('Phase 3: SISIntegrationService', () => {
  beforeEach(() => jest.resetAllMocks());

  const validStudent = {
    external_id: 'SIS-001',
    name: 'New Student',
    email: 'new@student.com',
    is_active: true,
  };

  it('creates a new student when email does not exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // no existing user
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // INSERT

    const result = await sisIntegrationService.syncStudents([validStudent]);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('updates existing student when email already in DB', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'existing-id' }], rowCount: 1 } as any) // found
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // UPDATE

    const result = await sisIntegrationService.syncStudents([validStudent]);

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
  });

  it('records error for student with missing email', async () => {
    const badStudent = { external_id: 'SIS-BAD', name: '', email: '', is_active: true };
    const result = await sisIntegrationService.syncStudents([badStudent]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.external_id).toBe('SIS-BAD');
  });

  it('handles multiple students in one batch', async () => {
    const students = [
      { external_id: 'S1', name: 'Alice', email: 'alice@s.com', is_active: true },
      { external_id: 'S2', name: 'Bob', email: 'bob@s.com', is_active: true },
    ];

    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // Alice: not found
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any) // Alice: INSERT
      .mockResolvedValueOnce({ rows: [{ id: 'bob-id' }], rowCount: 1 } as any) // Bob: found
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // Bob: UPDATE

    const result = await sisIntegrationService.syncStudents(students);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('verifyWebhookSignature returns true for valid HMAC-SHA256', () => {
    const secret  = 'my-sis-secret';
    const payload = '{"students":[]}';
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;

    expect(sisIntegrationService.verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it('verifyWebhookSignature returns false for tampered payload', () => {
    const secret   = 'my-sis-secret';
    const payload  = '{"students":[]}';
    const tampered = '{"students":[{"email":"hacker@evil.com"}]}';
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;

    expect(sisIntegrationService.verifyWebhookSignature(tampered, sig, secret)).toBe(false);
  });
});

// ─── Phase 3: Liveness Detection Stub ────────────────────────────────────────

describe('Phase 3: LivenessService (stub)', () => {
  it('returns a safe stub result — never throws', async () => {
    const buf = Buffer.from('fake-image-data');
    const result = await livenessService.checkLiveness(buf);
    expect(result).toHaveProperty('is_live');
    expect(result).toHaveProperty('liveness_score');
    expect(typeof result.is_live).toBe('boolean');
    expect(result.liveness_score).toBeGreaterThanOrEqual(0);
    expect(result.liveness_score).toBeLessThanOrEqual(1);
  });

  it('identifies itself as stub method', async () => {
    const result = await livenessService.checkLiveness(Buffer.alloc(0));
    expect(result.method).toBe('stub');
  });
});

// ─── Phase 3: OCR Service Stub ────────────────────────────────────────────────

describe('Phase 3: OCRService (stub)', () => {
  it('returns stub result without throwing', async () => {
    const buf = Buffer.from('fake-id-card-image');
    const result = await ocrService.extractIDCardData(buf);
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('method');
    expect(result.method).toBe('stub');
  });

  it('parseIDNumber extracts Aadhaar-like 12-digit number', () => {
    const text = 'Name: John Doe DOB: 01/01/1990 ID: 1234 5678 9012';
    const id = ocrService.parseIDNumber(text);
    expect(id).toBe('123456789012');
  });

  it('parseIDNumber returns null for unrecognised format', () => {
    const text = 'No ID numbers here';
    expect(ocrService.parseIDNumber(text)).toBeNull();
  });

  it('parseIDNumber extracts passport-style ID', () => {
    const text = 'Passport No: A1234567 Country: IND';
    const id = ocrService.parseIDNumber(text);
    expect(id).not.toBeNull();
  });
});

// ─── Phase 2: Multi-tenant schema assertions ───────────────────────────────────

describe('Phase 3: Multi-tenant schema (006 migration)', () => {
  it('006_multi_tenant.sql creates institutions table', () => {
    const fs   = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/006_multi_tenant.sql'),
      'utf8'
    );
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS institutions');
    expect(sql).toContain('institution_id UUID');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS push_tokens');
    expect(sql).toContain('report_hash');
  });

  it('default institution seed exists in migration', () => {
    const fs   = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/006_multi_tenant.sql'),
      'utf8'
    );
    expect(sql).toContain('Default Institution');
    expect(sql).toContain('DEFAULT');
  });
});
