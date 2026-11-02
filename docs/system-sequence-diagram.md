# System Sequence Diagram: Scan Happy Path

How one lot scan travels from the shop-floor UI through `orthanc-scan-producer`, RabbitMQ and `orthanc-scan-consumer`, until the lot's new location is published to other systems. This is the happy path at the process level. For the UI's internal flows (retries, mismatches, outages), see [sequence-diagrams.md](sequence-diagrams.md).

```mermaid
sequenceDiagram
    autonumber
    actor Op as Operator
    participant UI as Scan UI (browser)
    participant P as Producer (plant API)
    participant MQ as RabbitMQ
    participant C as Consumer (lot service)
    participant DB as Consumer DB
    participant Sub as Lot event subscribers

    rect rgba(100, 150, 255, 0.12)
        Note over Op,C: Load the stage catalog
        Op->>UI: Open the scan station
        UI->>P: GET /api/lot-stages
        opt Producer's catalog copy is older than 1 minute
            P->>C: GET /api/lot-stages
            C->>DB: Read stages and routes
            C-->>P: Stage catalog JSON
            P->>P: Cache in memory and on disk
        end
        P-->>UI: Stage catalog JSON (passed through as-is)
        UI->>UI: Save to localStorage, show stage list
    end

    rect rgba(150, 150, 150, 0.12)
        Note over Op,UI: Start a session (UI only)
        Op->>UI: Pick stage, enter user name
        UI->>UI: Store session, open the scan screen
    end

    rect rgba(100, 200, 120, 0.12)
        Note over Op,C: Submit and validate the scan (synchronous)
        Op->>UI: Scan lot barcode, then destination barcode
        UI->>UI: Add pending scan with new clientId
        UI->>P: POST /api/scans (Idempotency-Key = clientId)
        P->>P: Not seen this clientId before
        P->>C: GET /api/lots/{lotId} (2 s timeout)
        C->>DB: Read lot
        C-->>P: Lot: active, not on hold, at the scan's stage
        P->>P: Destination is a valid next stage / WIP location
        P->>MQ: Publish scan to orthanc.scans (routing key scan.created)
        MQ-->>P: Accepted, queued on orthanc.scans
        P->>P: Remember accepted response for clientId
        P-->>UI: 200 ScanResponse (no errorCode)
        UI->>UI: Mark scan success
        UI-->>Op: History row shows the move
    end

    Note over P,C: The scan is now on the queue. The consumer processes it on its own time, after the UI already has its answer.

    rect rgba(255, 180, 80, 0.14)
        Note over MQ,DB: Apply the scan to the lot (asynchronous)
        MQ->>C: Deliver scan message
        activate C
        C->>DB: Begin transaction
        C->>DB: Scan with this clientId already stored? (no)
        C->>DB: Save scan
        C->>DB: Load lot, apply scan, save new location
        C->>DB: Write lot history entry
        C->>DB: Write lot.moved event to outbox
        C->>DB: Commit
        C-->>MQ: Ack message
        deactivate C
    end

    rect rgba(200, 120, 220, 0.12)
        Note over C,Sub: Publish the lot event (outbox relay, every 1 s)
        C->>DB: Read unpublished outbox events
        DB-->>C: lot.moved event
        C->>MQ: Publish to orthanc.lots (routing key lot.moved)
        MQ-->>C: Publisher confirm
        C->>DB: Mark event published
        MQ->>Sub: Deliver lot.moved to each bound queue
    end
```

## Notes

- **Sync vs. async boundary.** The operator gets an answer as soon as RabbitMQ accepts the scan (step 20) and the producer replies (step 22). Steps 25 and later happen independently, so the lot's recorded location changes shortly after the UI shows success.
- **Idempotency at every hop.** The UI's `clientId` travels end to end. The producer returns the original response for a repeat `clientId` without publishing again. The consumer skips a redelivered message whose `clientId` is already stored. Lot-event subscribers de-duplicate on the event's `eventId`.
- **Transactional outbox.** The scan, the lot's new location, its history entry and the outgoing `lot.moved` event are committed together. The relay publishes the event only after the commit and marks it published only after the broker confirms, so no event is lost or published for a scan that was rolled back.
- **Event type.** A scan that moves the lot to another stage or WIP location emits `lot.moved`. A scan that leaves it in the same place emits `lot.scanned`.
- **Where the unhappy paths branch off:**
  - The producer can answer with an `errorCode` instead of publishing (steps 17–18): the lot is on hold or not active, the destination is invalid, or `LOT_LOCATION_MISMATCH`.
  - If the consumer lookup fails or its circuit is open, the producer skips the lot checks and publishes anyway, and the consumer flags issues later.
  - If RabbitMQ is down, the publish fails, the UI marks the scan failed and retries it.
  - On the consumer side, a message that keeps failing is retried twice and then dead-lettered to `orthanc.scans.dlq` (reviewable at `/dead-letters`).
