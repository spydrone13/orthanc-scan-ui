export interface LotStage {
  id: string;
  description: string;
  nextStages: string[];
  wipLocations: string[];
}

export interface DestinationOption {
  value: string;
  label: string;
  scanType: 'transitional' | 'informational';
}

/** Shape of GET /api/lot-stages, keyed by stage id. */
export type LotStagesResponse = Record<string, {
  description: string;
  'next-stages'?: string[];
  'wip-locations'?: string[];
}>;

export interface ScanRecord {
  /** Client-generated id, sent as the idempotency key so the API can ignore repeat sends. */
  clientId: string;
  userName: string;
  currentStage: string;
  lotId: string;
  destination: string;
  scanType?: 'transitional' | 'informational';
  note: string;
}

/** A 200 response may still carry a business error (e.g. lot on hold / canceled). */
export interface ScanResponse extends ScanRecord {
  errorCode?: string;
  errorMessage?: string;
}

/**
 * - failed:   no response, timeout or non-2xx; the scan was not recorded and can be resent.
 * - rejected: API responded 200 with an error code; not resendable.
 */
export type ScanStatus = 'pending' | 'success' | 'failed' | 'rejected';

export interface ScanHistoryItem extends ScanRecord {
  status: ScanStatus;
  errorMessage?: string;
  /** Epoch ms when the user submitted the scan. */
  submittedAt?: number;
  /** Epoch ms when the most recent send started. */
  lastAttemptAt?: number;
  /** Number of failed sends so far. */
  attempts?: number;
  /** Epoch ms when a failed scan is next auto-retried. */
  nextRetryAt?: number;
}

export interface SessionData {
  userName: string;
  currentStage: string;
}
