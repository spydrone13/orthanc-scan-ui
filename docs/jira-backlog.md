# Orthanc Scan UI — Jira Backlog

This backlog rebuilds the Orthanc Scan UI by hand, using the prototype in this repo (`orthanc-scan-ui`) as the reference spec.

## About the app

Operators use the app to record lot movements on the floor. An operator:

1. Picks the **stage** they're working at.
2. Starts a session by entering their name.
3. Scans lots by entering a Lot ID and a **destination**. The destination is either a WIP location at the current stage or a next stage.

Scans go into a queue that survives reloads and network outages. Scans that fail are retried automatically. The API can reject a scan. When the records place the lot at another stage, the API asks the operator to confirm where the lot really is.

The production build is served by `orthanc-scan-producer` and calls `/api/lot-stages` and `/api/scans` on the same origin.

## Glossary

| Term | Meaning |
|---|---|
| **Stage** | A step in the process, such as Intake or Wafer Prep. Each stage has an id, a description, its allowed **next stages** and its **WIP locations**. |
| **WIP location** | A physical spot within a stage, such as `INTAKE-001` / "Intake 1". |
| **next-wip-locations** | For each next stage, the WIP locations at that next stage that the current stage may send lots to. If a next stage isn't listed, all of its locations are allowed. If its list is empty, only the stage itself is allowed. |
| **Transitional scan** | Moves the lot to a next stage, optionally into one of its WIP locations. |
| **Informational scan** | Records the lot at a WIP location within its current stage. |
| **clientId** | A UUID the client generates for each scan. It is sent as the `Idempotency-Key` header so the API ignores repeat sends. |
| **Scan statuses** | `pending`: being sent. `success`: recorded. `failed`: no response, a timeout or a non-2xx response; it can be resent. `rejected`: a 200 response with an error code; it can't be resent. `mismatch`: the API rejected it because the lot is recorded at another stage; it can be resent once the operator confirms. |

## How to use this file

- Each `## UI-NN` section below is one Jira **Story**. Paste the heading as the Summary and the body as the Description.
- The stories are listed in dependency order. **Depends on** names the stories that must be done first.
- **Reference** points to the prototype code. It shows one way the behavior has been built; it is not a requirement.

## Definition of Done (applies to every story)

- The acceptance criteria are met and demoed against the dev mock API (UI-03).
- There are unit tests for the logic: services, guards, and mapping or formatting functions.
- Every interactive element works with the keyboard and has an accessible name. Validation errors appear next to their field.
- The layout works on a handheld or tablet-width screen.
- When localStorage or sessionStorage is unavailable (private mode, quota), the app degrades without crashing.

---

## UI-01: App scaffold, shell layout and environments

**Type:** Story · **Labels:** scan-ui, foundation · **Depends on:** —

**As a** developer, **I want** a project skeleton with routing, a shared page layout and per-environment config, **so that** feature stories have somewhere to land.

### Acceptance criteria
- Visiting `/` redirects to `/scan-lot`.
- The scan-lot screens render inside a shared page with a centered card.
- Routes under `/scan-lot`: `''` (stage picker), `:stage` (start session), `:stage/scan` (scan screen). Route params are bound as component inputs.
- The `/admin` route is registered only when `enableAdmin` is true.
- Environment config holds `lotStagesUrl`, `scanUrl`, `useMockApi` and `enableAdmin`:
  - **Dev:** `http://localhost:3000/api/...`, admin enabled.
  - **Prod:** same-origin `/api/lot-stages` and `/api/scans`, admin disabled.
- npm scripts exist to serve dev, serve prod config, build, and run tests.

### Reference
- `src/app/app.routes.ts`, `src/app/app.config.ts`, `src/app/scan-lot/scan-lot.ts` + `.html` (shell), `src/environments/environment*.ts`, `angular.json` (file replacements for prod).

---

## UI-02: Scan API client and data models

**Type:** Story · **Labels:** scan-ui, api · **Depends on:** UI-01

**As a** developer, **I want** a typed API client behind an abstraction, **so that** the real API and a mock can be swapped without changing feature code.

### Acceptance criteria
- `getLotStages()` calls `GET {lotStagesUrl}`. The response is an object keyed by stage id: `{ description, next-stages?, wip-locations?: { [id]: { description } }, next-wip-locations?: { [nextStageId]: string[] } }`.
- `postScan(record)` calls `POST {scanUrl}` with the scan record as the body and the header `Idempotency-Key: <clientId>`.
- A scan record has these fields:
  - `clientId`, `userName`, `currentStage`, `lotId`
  - `destinationStage`
  - `destinationWipLocation?`
  - `scanType?` (`transitional` | `informational`)
  - `note`
  - `locationConfirmed?` (true once the operator confirms a mismatched lot is here)
  - `correctionReason?` (optional reason given with the confirmation)
- The response echoes the record. A **200 response may still carry** `errorCode` / `errorMessage`. With `LOT_LOCATION_MISMATCH` it also carries `recorded: { stage, wipLocation?, scannedBy?, scannedAt? }`.
- Which implementation is used is decided at **build time**. Production bundles never contain mock code.

### Reference
- `src/app/scan-lot/scan-api.ts` (abstract `ScanApi` + `HttpScanApi`), `src/app/scan-lot/scan-lot.models.ts`, `src/environments/scan-api.provider.ts` / `scan-api.provider.prod.ts`.

---

## UI-03: Dev mock scan API

**Type:** Story · **Labels:** scan-ui, dev-tooling · **Depends on:** UI-02

**As a** developer, **I want** an in-memory mock API that produces realistic failures, **so that** I can build and demo the error handling without a backend.

### Acceptance criteria
- `getLotStages()` returns a fixture catalog after about 300 ms. The fixture includes at least one stage with `next-wip-locations`.
- `postScan()` responds after about 2 s and simulates these cases:
  - Every 4th new scan is rejected, rotating through *Lot on hold* (`LOT_ON_HOLD`), *location mismatch* (`LOT_LOCATION_MISMATCH` with a `recorded` location), and *Lot canceled* (`LOT_CANCELED`).
  - A location mismatch resent with `locationConfirmed` is accepted.
  - Every 3rd new scan is recorded, but its response is "lost" (the call errors).
  - The mock is idempotent: a repeat send with an accepted `clientId` returns the original response and doesn't count as a new scan. Rejected scans are not remembered.
  - It sets `scanType` to `transitional` when the destination is one of the current stage's next stages, and `informational` otherwise.
- The mock is enabled with `useMockApi` and only in dev builds.

### Reference
- `src/app/scan-lot/mock/mock-scan-api.ts`, `src/app/scan-lot/mock/lot-stages.json`.

---

## UI-04: Load the lot stage catalog, with an offline fallback

**Type:** Story · **Labels:** scan-ui, data · **Depends on:** UI-02

**As an** operator, **I want** the stage list to load even when the network is down, **so that** I can keep scanning offline.

### Acceptance criteria
- The catalog is fetched once and held in memory. Later loads reuse it.
- The response is mapped to a list of stages: `{ id, description, nextStages[], wipLocations[{id, description}], nextWipLocations{} }`. Missing optional keys become empty values.
- Each successful response is saved to localStorage.
- If the API call fails and a saved copy exists, the saved copy is used. If no saved copy exists, the error is raised.
- Helper functions:
  - Stage description by id, falling back to the id.
  - WIP location description, falling back to the id (covers free-text and retired locations).

### Reference
- `src/app/scan-lot/stage.service.ts`: `loadStages`, `stageDescription`, `wipLocationDescription`.

---

## UI-05: Stage picker screen

**Type:** Story · **Labels:** scan-ui, screen · **Depends on:** UI-04

**As an** operator, **I want** to pick my current stage from a list, **so that** my scans are recorded against it.

### Acceptance criteria
- `/scan-lot` shows the title "Select Current Stage" and a list of every stage by description.
- Each item links to `/scan-lot/<stageId>`.
- The list sits in a `nav` landmark labeled "Current stage".

### Reference
- `src/app/scan-lot/stage-picker/*`.

---

## UI-06: Remember the last stage picked

**Type:** Story · **Labels:** scan-ui, persistence · **Depends on:** UI-05

**As an** operator, **I want** the app to reopen at the stage I used last, **so that** I don't have to pick it every time.

### Acceptance criteria
- Opening `/scan-lot/<stage>` saves that stage in localStorage, so it survives closing the tab.
- When the app is **first loaded** at `/scan-lot` with a saved stage, it goes to `/scan-lot/<saved stage>`.
- When the operator navigates back to `/scan-lot` from inside the app, the stage list is shown and there is no redirect. Browser Back still reaches the list.
- If the saved stage is no longer in the catalog, it is cleared and the list is shown.

### Reference
- `src/app/scan-lot/stage.service.ts` (`rememberedStage`, `rememberStage`), `src/app/scan-lot/scan-lot.guard.ts` (`router.navigated` check).

---

## UI-07: Start session screen

**Type:** Story · **Labels:** scan-ui, screen · **Depends on:** UI-05

**As an** operator, **I want** to enter my name before scanning, **so that** every scan records who made it.

### Acceptance criteria
- `/scan-lot/<stage>` shows:
  - a "← Back" link to the stage list
  - the title "Start Scanning Session"
  - the stage description
  - a **User Name** field
- When the operator submits an empty name, the field shows "User name is required." and nothing is submitted.
- On a valid submit, the session `{ userName, currentStage }` is saved to localStorage, so it outlives the tab and is shared with other tabs. The app then navigates to `/scan-lot/<stage>/scan`, **replacing** the history entry so Back doesn't land on the form.
- Starting a session clears scans that are done (success or rejected) from the history and keeps unsent ones (see UI-11).
- A session saved in sessionStorage by older builds is read and moved to localStorage.

### Reference
- `src/app/scan-lot/start-session/*`, `src/app/scan-lot/session.service.ts`.

---

## UI-08: Route guard keeps the URL consistent with the session

**Type:** Story · **Labels:** scan-ui, routing · **Depends on:** UI-06, UI-07

**As an** operator, **I want** the URL alone to decide which screen I see, **so that** refreshes, bookmarks and new tabs always land in the right place.

### Acceptance criteria
- The guard loads the catalog (UI-04) before deciding where to go.
- **With an active session:** any scan-lot URL other than `/scan-lot/<session stage>/scan` redirects there.
- **With a saved session whose stage is no longer in the catalog:** the session is ended.
- **Without a session:**
  - `/scan-lot/<unknown stage>` goes to `/scan-lot`.
  - `/scan-lot/<stage>/scan` goes to `/scan-lot/<stage>`.
  - Legacy `/scan-lot?stage=<id>` bookmarks go to `/scan-lot/<id>` when the stage is known, and to `/scan-lot` otherwise.
  - Remembered-stage behavior follows UI-06.

### Reference
- `src/app/scan-lot/scan-lot.guard.ts` (+ `scan-lot.guard.spec.ts` for the cases).

---

## UI-09: Scan form

**Type:** Story · **Labels:** scan-ui, screen · **Depends on:** UI-08

**As an** operator, **I want** a quick form to record a lot's move, **so that** I can scan lots one after another.

### Acceptance criteria
- `/scan-lot/<stage>/scan` shows:
  - a "← Back" button
  - the title "Scan Lot to New Stage"
  - the session **User** and **Stage**
  - the form
- Form fields:
  - **Lot ID** (required, placeholder "e.g. LOT-001")
  - **Destination** (required, see UI-10)
  - **Note** (optional, 3-row textarea)
- Submitting with missing fields marks them and shows "Lot ID is required." / "Destination is required."
- On a valid submit, the scan is queued (UI-11) and the form resets right away, without waiting for the API.
- **Back** ends the session and returns to `/scan-lot/<stage>`, so a different operator can sign in at the same stage.

### Reference
- `src/app/scan-lot/scan/scan.ts` (`onScanSubmit`, `goBackToUsername`), `src/app/scan-lot/scan/scan.html`.

---

## UI-10: Destination combobox

**Type:** Story · **Labels:** scan-ui, component · **Depends on:** UI-09

**As an** operator, **I want** to pick or type a destination with suggestions, **so that** I choose valid destinations quickly and can still type a location that isn't listed.

### Acceptance criteria
- When the field gets focus, a grouped suggestion list opens:
  1. **"WIP Location"**: the current stage's WIP locations (informational scans).
  2. One group per next stage, labeled **"Next Stage: <description>"**. Each group lists the stage itself, then the WIP locations allowed by `next-wip-locations` (transitional scans).
  - Empty groups are hidden.
- Typing filters the options (case-insensitive) on the label, the stage id or the location id. Groups with no matches are hidden.
- Choosing an option fills the field with its label and closes the list. Choosing works with the mouse before the input loses focus.
- On submit, the text is resolved to a destination by an exact case-insensitive match on the label, the WIP location id, or the stage id (stage-only options).
- **Free text that matches nothing** is sent as a WIP location at the *current* stage: `destinationStage = currentStage`, `destinationWipLocation = text`.
- The list uses `listbox`/`option` roles. *Improvement over the prototype:* add arrow-key navigation and `aria-activedescendant`.

### Reference
- `src/app/scan-lot/stage.service.ts` (`destinationGroups`, `allowedWipLocations`, `findDestination`), `src/app/scan-lot/scan/scan.ts` (`filteredGroups`, focus/blur handling).

---

## UI-11: Scan queue and persisted history

**Type:** Story · **Labels:** scan-ui, offline · **Depends on:** UI-02

**As an** operator, **I want** my scans kept on the device until they're sent, **so that** a reload or an outage never loses a scan.

### Acceptance criteria
- Each submitted scan gets a new `clientId` (UUID). It goes to the top of the history as `pending` with a `submittedAt` time and is sent right away.
- The history is capped at the **100** most recent scans and saved to localStorage on every change.
- On reload, any scan still `pending` becomes `failed` with "Interrupted by page reload." and a retry is due in 10 s, since it may or may not have reached the API.
- `clearSent()` (called when a session starts) removes `success` and `rejected` scans and keeps `pending`, `failed` and `mismatch` ones.
- `removeScan(clientId)` drops a scan. A response that arrives later for it is ignored.
- History saved by older builds with a single `destination` field is migrated:
  - informational: becomes `destinationWipLocation` at the current stage.
  - otherwise: becomes `destinationStage`.

### Reference
- `src/app/scan-lot/scan-queue.service.ts` (`submitScan`, `readScanHistory`, `clearSent`, `removeScan`, `migrateLegacyDestination`) + `scan-queue.service.spec.ts`.

---

## UI-12: Recent scans list on the scan screen

**Type:** Story · **Labels:** scan-ui, screen · **Depends on:** UI-09, UI-11

**As an** operator, **I want** to see what happened to my recent scans, **so that** I know which ones need attention.

### Acceptance criteria
- A "Recent Scans" section appears below the form when the history isn't empty, newest first.
- Each row shows a status icon (with an aria-label), the **Lot ID**, a message and the submitted date and time:

  | Status | Icon | Message |
  |---|---|---|
  | pending | ⌛ | "Scanning to *dest*" |
  | failed | ⚠ | "Scan to *dest* failed" (tooltip: error + attempt number) |
  | rejected | ✗ | "Scan to *dest* rejected:" + reason |
  | mismatch | ? | "Scan to *dest* needs checking:" (see UI-16) |
  | success (transitional) | ✓ | "*Current stage* → *dest*" |
  | success (informational) | ✓ | "Scanned to *dest*" |

- The destination label is:
  - the stage description, for a next stage;
  - the location description, for a WIP location at the current stage;
  - "*Stage* · *Location*", for a WIP location at a next stage.
- Each status has its own row style.
- When a message is cut off, hovering or focusing it shows a popover with the full text. When the text fits, there's no popover.

### Reference
- `src/app/scan-lot/scan/scan.html` (history block), `scan.ts` (`historyMessage`, `checkTruncated`, `formatDateTime`), `stage.service.ts#destinationLabel`, `scan.css`.

---

## UI-13: Auto-retry failed scans with backoff

**Type:** Story · **Labels:** scan-ui, offline · **Depends on:** UI-11

**As an** operator, **I want** failed scans resent automatically, **so that** I don't have to watch the connection.

### Acceptance criteria
- A send fails when there is no response within **15 s**, a network error, or a non-2xx status. The scan becomes `failed`, `attempts` goes up by 1, and the next retry is scheduled after **10 s, 20 s, 40 s, …, capped at 5 min**.
- A loop checks every second and resends failed scans that are due, with the same `clientId`.
- When the browser fires `online`, every failed scan becomes due right away.
- The **"Retry now"** button on a failed row resends it immediately.
- Error messages are readable:
  - timeout: "Server did not respond."
  - status 0: "Unable to reach the server."
  - error body string or `message`: that text
  - otherwise: "<status> <statusText>"
- Retries start only once the scan-lot screens are open. Opening only `/admin` doesn't start them.

### Reference
- `src/app/scan-lot/scan-queue.service.ts` (`send`, `retryDelay`, `runRetryLoop`, `retryDue`, `resendScan`, `errorMessage`), `scan-lot.ts` (starts the loop).

---

## UI-14: Multi-tab coordination

**Type:** Story · **Labels:** scan-ui, offline · **Depends on:** UI-13

**As an** operator with several tabs open, **I want** the tabs to share one scan history and not send duplicates, **so that** the history is consistent and the API isn't flooded.

### Acceptance criteria
- When another tab changes the saved history, this tab adopts it through the `storage` event and doesn't overwrite it with a stale copy. Pending scans from other tabs are *not* turned into failed.
- Where Web Locks are available, a single named lock lets only one tab run the retry loop. When that tab closes, a waiting tab takes over.
- Without Web Locks (an insecure context), every tab retries, and the idempotency key keeps the repeats harmless.
- The session (UI-07) is shared across tabs.

### Reference
- `src/app/scan-lot/scan-queue.service.ts` (constructor `storage` listener, `startAutoRetry`).

---

## UI-15: Show business rejections

**Type:** Story · **Labels:** scan-ui, errors · **Depends on:** UI-12

**As an** operator, **I want** to see when the system refuses a scan and why, **so that** I can deal with the lot (for example, a lot on hold or canceled).

### Acceptance criteria
- When a 200 response carries an `errorCode` (other than a first-time location mismatch), the scan becomes `rejected` with `errorMessage`, or the code if there is no message.
- The row shows the reason. Rejected scans are **never** retried or resent.

### Reference
- `src/app/scan-lot/scan-queue.service.ts` (`rejectionReason`, `send` map), `scan.html` (`history-reason`).

---

## UI-16: Resolve a lot location mismatch

**Type:** Story · **Labels:** scan-ui, errors · **Depends on:** UI-15

**As an** operator, **I want** to confirm or deny that a lot is at my stage when the records disagree, **so that** the records get corrected or the bad scan is dropped.

### Acceptance criteria
- A `LOT_LOCATION_MISMATCH` response to a scan that isn't `locationConfirmed` puts it in `mismatch`. The row shows the API message as an alert, plus **"It's here"** and **"Not here"** buttons.
- **It's here:**
  - Opens an optional reason textarea (labeled "Why the record is wrong (optional)", max 2000 chars) that gets focus, with **Correct record** and **Cancel** buttons.
  - **Correct record** is always enabled; the reason may be left empty.
  - Submitting resends the scan with the **same clientId**, `locationConfirmed: true`, and the trimmed `correctionReason` if one was given.
- **Second mismatch:** if the resent scan is still a mismatch, it becomes `rejected`. It can't be resolved in the UI.
- **Not here:** the scan becomes `rejected` and isn't sent again.
- Only one row's reason form is open at a time.
- Mismatch scans count as unsent: they survive `clearSent()` (UI-11).

### Reference
- `src/app/scan-lot/scan-queue.service.ts` (`confirmLocation`, `dismissMismatch`), `scan.ts` (`startConfirm`, `onConfirmLocation`, `onNotHere`), `scan.html` (mismatch block).

---

## UI-17: Admin — simulated API outage toggle (dev only)

**Type:** Story · **Labels:** scan-ui, admin, dev-tooling · **Depends on:** UI-03, UI-13

**As a** tester, **I want** a switch that makes scans fail like a network outage, **so that** I can check the retry and offline behavior.

### Acceptance criteria
- `/admin` exists only when `enableAdmin` is set, which is never in prod. It shows a "← Back to scanning" link and the title "Test Settings".
- **"Simulate API outage"** is a `role="switch"` checkbox with a status line:
  - "ON — scans will fail as network errors"
  - "Off — API normal"
- While the switch is on, `postScan` fails after about 1 s as a status-0 network error. `getLotStages` is unaffected.
- The setting is saved in localStorage and synced to other open tabs through the `storage` event.
- While the outage is on, the scan screen shows a banner, "Simulated API outage is ON · Test settings", that links to `/admin`.

### Reference
- `src/app/admin/test-settings.service.ts`, `src/app/admin/simulated-outage-scan-api.ts`, `src/environments/scan-api.provider.ts`, `scan.html` (outage banner).

---

## UI-18: Admin — scan history table

**Type:** Story · **Labels:** scan-ui, admin, dev-tooling · **Depends on:** UI-17

**As a** tester, **I want** a detailed view of the scan queue, **so that** I can see retries in progress and clear out stuck scans.

### Acceptance criteria
- Count chips: Pending, Failed, Rejected, To confirm (mismatch), Success.
- Empty state: "No scans yet in this tab."
- Table columns:
  - Status badge
  - Lot (monospace)
  - User
  - From → To, with the note shown below when present
  - Type (or —)
  - Submitted
  - Attempts
  - Last attempt
  - Next retry: failed scans only, with a live countdown (`Ns`, `M:SS`, or `due`) that updates every second
  - Error (highlighted for rejected and mismatch)
- **Retry now** for failed scans. **Remove** for pending or failed scans, after a confirmation that warns the scan won't be retried and may already be recorded on the server.
- The page loads the catalog itself, so labels resolve even when it's opened directly.

### Reference
- `src/app/admin/admin.ts`, `src/app/admin/admin.html`, `src/app/admin/admin.css`.

---

## Notes from the prototype review

These are small issues found while writing the stories. Don't copy them into the rebuild:

- The admin page note says "Successful and rejected scans are not kept across reloads," but the queue saves *all* statuses (up to 100) until the next session starts. Reword the note, or change the behavior on purpose.
- The admin Remove confirmation is missing a space ("retried.If it already…").
- The destination combobox has no keyboard navigation (see UI-10).
