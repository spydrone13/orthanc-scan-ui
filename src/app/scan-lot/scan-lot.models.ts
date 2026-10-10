export interface LotStage {
  id: string;
  description: string;
  nextStages: string[];
  wipLocations: WipLocation[];
  /**
   * WIP location ids allowed in a next stage, keyed by next-stage id. A next stage not listed
   * allows all of its WIP locations; an empty list allows only the stage itself.
   */
  nextWipLocations?: Record<string, string[]>;
}

export interface WipLocation {
  id: string;
  description: string;
}

/** A combobox choice and the destination fields it resolves to. */
export interface DestinationOption {
  label: string;
  destinationStage: string;
  destinationWipLocation?: string;
  scanType: 'transitional' | 'informational';
}

export interface DestinationGroup {
  label: string;
  options: DestinationOption[];
}

/** Shape of GET /api/lot-stages, keyed by stage id. */
export type LotStagesResponse = Record<string, {
  description: string;
  'next-stages'?: string[];
  /** Keyed by WIP location id. */
  'wip-locations'?: Record<string, { description: string }>;
  /** Keyed by next-stage id; see LotStage.nextWipLocations. */
  'next-wip-locations'?: Record<string, string[]>;
}>;

export interface ScanRecord {
  /** Client-generated id, sent as the idempotency key so the API can ignore repeat sends. */
  clientId: string;
  userName: string;
  currentStage: string;
  lotId: string;
  /** Next-stage id, or the current stage when scanning to a WIP location. */
  destinationStage: string;
  /** WIP location; set for an informational scan. */
  destinationWipLocation?: string;
  scanType?: 'transitional' | 'informational';
  note: string;
  /**
   * Set when the operator confirms the lot is at currentStage although the records have it
   * elsewhere (after a LOT_LOCATION_MISMATCH response).
   */
  locationConfirmed?: boolean;
  /** Optional reason the operator gave with locationConfirmed. */
  correctionReason?: string;
}

/** Error code for a lot the records have at another stage; resent with locationConfirmed once confirmed. */
export const LOT_LOCATION_MISMATCH = 'LOT_LOCATION_MISMATCH';

/** Where the records have a lot, and the scan that put it there. */
export interface RecordedLocation {
  stage: string;
  wipLocation?: string;
  scannedBy?: string;
  /** ISO-8601 instant. */
  scannedAt?: string;
}

/** A 200 response may still carry a business error (e.g. lot on hold / canceled). */
export interface ScanResponse extends ScanRecord {
  errorCode?: string;
  errorMessage?: string;
  /** With LOT_LOCATION_MISMATCH. */
  recorded?: RecordedLocation;
}

/**
 * - failed:   no response, timeout or non-2xx; the scan was not recorded and can be resent.
 * - rejected: API responded 200 with an error code; not resendable.
 * - mismatch: rejected because the records have the lot at another stage; resendable once the
 *             operator confirms the lot is here (optionally giving a reason).
 */
export type ScanStatus = 'pending' | 'success' | 'failed' | 'rejected' | 'mismatch';

export interface ScanHistoryItem extends ScanRecord {
  status: ScanStatus;
  errorMessage?: string;
  /** With status mismatch. */
  recorded?: RecordedLocation;
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
