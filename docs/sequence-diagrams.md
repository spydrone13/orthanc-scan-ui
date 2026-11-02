# Sequence Diagrams

Runtime flows of `orthanc-scan-ui`. The participating classes are described in [class-diagram.md](class-diagram.md). `ScanApi` is `HttpScanApi` in production, and in dev builds it is wrapped by `SimulatedOutageScanApi`.

## 1. App load and routing guard

Every child route of `/scan-lot` passes through `scanLotGuard`, which loads the stage catalog first and then decides which screen the URL may show.

```mermaid
sequenceDiagram
    actor Op as Operator
    participant R as Router
    participant G as scanLotGuard
    participant SS as StageService
    participant API as ScanApi
    participant LS as localStorage
    participant Ses as SessionService

    Op->>R: open /scan-lot/...
    R->>G: canActivateChild(childRoute)
    G->>SS: loadStages()
    alt stages already loaded
        SS-->>G: cached LotStage list
    else first load
        SS->>API: getLotStages()
        alt API answers
            API-->>SS: LotStagesResponse
            SS->>LS: store scan-lot.lot-stages
        else offline / error
            SS->>LS: read scan-lot.lot-stages
            LS-->>SS: last saved catalog (or rethrow if none)
        end
        SS->>SS: map to LotStage list, stages.set()
        SS-->>G: LotStage list
    end

    G->>Ses: sessionData()
    opt restored session has an unknown stage
        G->>Ses: end()
    end

    alt active session
        alt already on /scan-lot/{session stage}/scan
            G-->>R: true
        else any other URL
            G-->>R: redirect /scan-lot/{session stage}/scan
        end
    else no session, no stage in URL
        alt legacy ?stage= query param
            G-->>R: redirect /scan-lot/{stage} (or /scan-lot if unknown)
        else remembered stage and first navigation
            G->>SS: rememberedStage()
            G-->>R: redirect /scan-lot/{remembered}
        else
            G-->>R: true (show stage picker)
        end
    else no session, unknown stage
        G-->>R: redirect /scan-lot
    else no session, on :stage/scan
        G-->>R: redirect /scan-lot/{stage}
    else no session, on :stage
        G->>SS: rememberStage(stage)
        G-->>R: true (show start-session form)
    end
```

## 2. Pick a stage and start a session

```mermaid
sequenceDiagram
    actor Op as Operator
    participant SP as StagePickerComponent
    participant R as Router
    participant G as scanLotGuard
    participant SSC as StartSessionComponent
    participant Ses as SessionService
    participant Q as ScanQueueService
    participant LS as localStorage
    participant Shell as ScanLotShellComponent
    participant Lock as Web Locks

    Note over Shell,Q: The shell is created once for /scan-lot
    Shell->>Q: startAutoRetry()
    Q->>Lock: request scan-lot.retry
    Lock-->>Q: granted (held until the tab closes)
    Q->>Q: runRetryLoop()

    Op->>SP: click a stage
    SP->>R: routerLink /scan-lot/{stage}
    R->>G: canActivateChild
    G->>G: rememberStage(stage)
    G-->>R: true
    R->>SSC: render with stage input

    Op->>SSC: enter user name, submit
    SSC->>Ses: start({userName, currentStage})
    Ses->>Q: clearSent()
    Q->>Q: keep only pending, failed and mismatch scans
    Ses->>Ses: session.set(data)
    Ses->>LS: store scan-lot.session
    SSC->>R: navigate /scan-lot/{stage}/scan (replaceUrl)
    R->>G: canActivateChild
    G-->>R: true (session matches)
```

## 3. Barcode scan and submit

The scanner sends each barcode wrapped in a delimiter character. The first barcode fills Lot ID, and the second fills Destination and submits the scan.

```mermaid
sequenceDiagram
    actor Sc as Barcode scanner
    participant C as ScanComponent
    participant SS as StageService
    participant Q as ScanQueueService
    participant API as ScanApi
    participant Srv as Scan backend

    Sc->>C: keydown delimiter
    C->>C: start buffering, arm 300 ms timer
    loop each character
        Sc->>C: keydown char
        C->>C: append to barcode, re-arm timer
    end
    Sc->>C: keydown delimiter
    C->>C: onBarcode(value)

    alt Lot ID is blank
        C->>C: lotId.setValue(value)
    else Lot ID already filled
        C->>SS: findDestination(stage, value)
        SS-->>C: DestinationOption or undefined
        C->>C: destination.setValue(label or raw value)
        C->>C: onScanSubmit()
        C->>SS: findDestination(stage, destination)
        Note over C: No match means free text is a WIP location in the current stage
        C->>C: scanForm.reset()
        C->>Q: submitScan({session, lotId, note, destination fields})
        Q->>Q: clientId = crypto.randomUUID()
        Q->>Q: prepend pending item to scanHistory (max 100)
        Q->>Q: send(record), set lastAttemptAt
        Q->>API: postScan(record) with 15 s timeout
        API->>Srv: POST /api/scans, Idempotency-Key = clientId
        Srv-->>API: 200 ScanResponse
        API-->>Q: ScanResponse
        alt no errorCode
            Q->>Q: status = success
        else errorCode LOT_LOCATION_MISMATCH, not yet confirmed
            Q->>Q: status = mismatch, keep recorded location
        else any other errorCode
            Q->>Q: status = rejected, errorMessage
        end
        Q-->>C: scanHistory signal updates the history list
    end

    opt Enter or Tab within 100 ms of the closing delimiter
        Sc->>C: keydown Enter/Tab
        C->>C: preventDefault (the scanner suffix must not submit the form)
    end
```

If no closing delimiter arrives within 300 ms, the keys were typed by hand, and `armBarcodeTimer` inserts them into the focused field.

## 4. Failure and auto-retry

```mermaid
sequenceDiagram
    participant Q as ScanQueueService
    participant API as ScanApi
    participant Win as window
    participant LS as localStorage

    Q->>API: postScan(record)
    API--xQ: network error, non-2xx or 15 s timeout
    Q->>Q: status = failed, attempts + 1
    Q->>Q: nextRetryAt = now + retryDelay(attempts)
    Note over Q: Backoff 10 s, 20 s, 40 s ... capped at 5 min

    loop every 1 s (only in the tab holding the retry lock)
        Q->>Q: retryDue()
        opt item failed and nextRetryAt has passed
            Q->>Q: resendScan(clientId), status = pending
            Q->>API: postScan(same clientId)
            alt response arrives
                API-->>Q: ScanResponse (success / rejected / mismatch)
            else fails again
                API--xQ: error
                Q->>Q: failed, longer backoff
            end
        end
    end

    Win->>Q: online event
    Q->>Q: set nextRetryAt = now on every failed scan
    Q->>Q: retryDue()

    Note over Q,LS: On page reload, readScanHistory() turns pending items into failed ("Interrupted by page reload") due in 10 s
    Note over API: Repeat sends reuse the clientId, so the API returns the original response instead of recording a second scan
```

## 5. Resolving a location mismatch

The backend has the lot at another stage. The operator either confirms that the lot really is here, or says it isn't.

```mermaid
sequenceDiagram
    actor Op as Operator
    participant C as ScanComponent
    participant Q as ScanQueueService
    participant API as ScanApi

    Note over C: History row shows "needs checking" with the recorded stage, user and time
    Op->>C: click "It's here"
    C->>C: startConfirm(clientId), focus reason field

    alt Operator confirms
        Op->>C: optional reason, confirm
        C->>Q: confirmLocation(clientId, reason)
        Q->>Q: status = pending, locationConfirmed = true, correctionReason
        Q->>API: postScan(same clientId, locationConfirmed = true)
        alt accepted
            API-->>Q: ScanResponse without errorCode
            Q->>Q: status = success (records corrected)
        else mismatch again or other error code
            API-->>Q: ScanResponse with errorCode
            Q->>Q: status = rejected (already confirmed once)
        end
    else Operator picks "Not here"
        Op->>C: Not here
        C->>Q: dismissMismatch(clientId)
        Q->>Q: status = rejected, no resend
    else Operator cancels
        Op->>C: cancel
        C->>C: cancelConfirm(), row stays mismatch
    end
```

## 6. Admin: simulated outage and queue management (dev builds)

```mermaid
sequenceDiagram
    actor Adm as Tester
    participant A as AdminComponent
    participant T as TestSettingsService
    participant LS as localStorage
    participant T2 as TestSettingsService (scanning tab)
    participant Sim as SimulatedOutageScanApi
    participant Inner as MockScanApi / HttpScanApi
    participant Q as ScanQueueService

    Adm->>A: toggle API outage on
    A->>T: setApiOutage(true)
    T->>LS: set test.apiOutage = true
    LS-->>T2: storage event
    T2->>T2: outage.set(true)

    Q->>Sim: postScan(record)
    alt apiOutage on
        Sim-->>Q: after 1 s, HttpErrorResponse status 0
        Q->>Q: status = failed ("Unable to reach the server.")
    else apiOutage off
        Sim->>Inner: postScan(record)
        Inner-->>Sim: ScanResponse
        Sim-->>Q: ScanResponse
    end

    Adm->>A: Retry now
    A->>Q: resendScan(clientId)
    Adm->>A: Remove
    A->>A: confirm() dialog
    A->>Q: removeScan(clientId)
    Note over A: A 1 s ticker drives the retry countdowns and counts() tallies statuses
```

## 7. Cross-tab synchronisation

```mermaid
sequenceDiagram
    participant QA as ScanQueueService (tab A)
    participant LS as localStorage
    participant QB as ScanQueueService (tab B)
    participant Lock as Web Locks

    QA->>Lock: request scan-lot.retry
    Lock-->>QA: granted, tab A runs the retry loop
    QB->>Lock: request scan-lot.retry
    Note over QB,Lock: Tab B waits

    QA->>QA: scanHistory.update(...)
    QA->>LS: effect: storeScanHistory, set scan-lot.history
    LS-->>QB: storage event (scan-lot.history)
    QB->>QB: scanHistory.set(parseHistory(newValue))
    Note over QB: Pending items stay pending, since tab A really has them in flight

    Note over QA: Tab A closes
    Lock-->>QB: granted, tab B takes over retries
```
