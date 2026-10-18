# Orthanc Scan UI — Application Overview

## Overview

Orthanc Scan UI is a browser app that operators use on the floor to record where entities move. An operator:

1. Picks the **department** they're working in.
2. Starts a session by entering their name.
3. Scans entities, recording each entity's ID and where it's going.

Scans are queued in the browser, so they survive page reloads and network outages. Failed scans are retried automatically. The backend can reject a scan, or ask the operator to confirm the entity's location when its records disagree.

The app is built with Angular 22 and Bootstrap 5. In production it's served by `orthanc-scan-producer` and calls that service's API on the same origin.

## Key terms

| Term | Meaning |
|---|---|
| **Department** | A step in the process, such as Receiving or Assembly. Each department has an ID, a description, the **next departments** an entity can move to, and its physical (WIP) locations. |
| **Physical (WIP) location** | A specific spot within a department, such as `RECEIVING-001` / "Receiving 1". |
| **Transitional scan** | Moves the entity to a next department, optionally into one of that department's physical (WIP) locations. |
| **Informational scan** | Records the entity at a physical (WIP) location within its current department. |
| **Session** | The operator's name and department. It's kept until the operator goes back, and it's shared by every tab in the browser. |
| **clientId** | A unique ID the browser generates for every scan. It is sent with each attempt so the backend can ignore repeats. |

Every scan has one of these statuses:

| Status | Meaning |
|---|---|
| `pending` | Being sent. |
| `success` | Recorded by the backend. |
| `failed` | No response, a timeout, or a server error. It is retried automatically and can be retried by hand. |
| `rejected` | The backend refused the scan for a business reason, such as the entity being on hold. It isn't retried. |
| `mismatch` | The backend's records place the entity in another department. It waits for the operator to confirm or dismiss. |

## Screens

The scanning screens share one page layout: a centered card with an **Admin** link below it. The URL always matches the operator's session. Opening the app goes to the scan screen when a session is active, and otherwise to the department the operator picked last (or the department list). This holds across tabs and reloads.

### 1. Select Current Department

**Route:** `/scan-entity`

**Purpose:** Choose the department the operator is working in.

- Lists every department from the backend's department list as a link.
- Picking one opens the Start Session screen for that department. The choice is remembered, so the app returns to it next time.

### 2. Start Scanning Session

**Route:** `/scan-entity/:department`

**Purpose:** Identify who is scanning.

- Shows the selected department and asks for a **User Name**, which is required.
- **Start Session** saves the session and opens the Scan screen. Finished scans from the previous session are cleared from the history; scans still waiting to be sent or confirmed are kept.
- **← Back** returns to the department list.

### 3. Scan Entity to New Department

**Route:** `/scan-entity/:department/scan`

**Purpose:** Record entity movements. This is where operators spend most of their time.

**Header**
- Shows the operator's name and department.
- **← Back** ends the session and returns to the Start Session screen.
- When the simulated outage is on (dev builds only), a yellow banner says so and links to Admin.

**Scan form**
- **Entity ID** (required).
- **Destination** (required). Focusing the field opens a list of suggestions grouped into:
  - the current department's physical (WIP) locations (an informational scan);
  - one group per next department: the department itself, plus the physical (WIP) locations the current department may send entities to there (a transitional scan).

  Typing filters the list by name or ID. Text that doesn't match any suggestion is recorded as a physical (WIP) location in the current department.
- **Note** (optional).
- **Barcodes.** The scanner sends each barcode wrapped in `%`. Wherever the focus is, a barcode fills **Entity ID** if it is blank, otherwise **Destination** (matched by name or ID, like typed text). Scanning doesn't submit; the operator still presses **Submit Scan**. A `%` typed by hand with no closing `%` stays in the field it was typed into.
- **Submit Scan** adds the scan to the queue, sends it, and clears the form. The operator can scan the next entity right away without waiting for a response.

**Recent Scans**
Lists the scans in the queue, newest first. Each row shows the entity ID, a short description, and when it was submitted, color-coded by status:

| Status | Shown as | Actions |
|---|---|---|
| Pending | Yellow, hourglass, "Scanning to …" | — |
| Failed | Yellow, warning icon, "Scan to … failed". Hovering shows the error and attempt count. | **Retry now** |
| Rejected | Red, ✗, "Scan to … rejected:" and the reason | — |
| Needs checking (mismatch) | Pink, "?", and the backend's explanation | **It's here** / **Not here** |
| Success | Green, ✓, "Receiving → Assembly" or "Scanned to Receiving 1" | — |

**Resolving a location mismatch**
- **It's here** opens an optional "why is the record wrong?" box. **Correct record** resends the same scan, marked as confirmed and with the reason, so the backend corrects its records. **Cancel** closes the box.
- **Not here** leaves the records unchanged, and the scan becomes a plain rejection.

### 4. Admin (Test Settings)

**Route:** `/admin`, available in every build and linked from every scanning screen.

**Purpose:** See and manage every scan in the browser's queue, for support and testing.

- **Scan History:** counts by status (Pending, Failed, Rejected, To confirm, Success), then a table of each scan with its:
  - status, entity, user, from → to departments, and scan type;
  - submitted time, attempt count, and last attempt;
  - next automatic retry (with a live countdown) and error message.
- **Retry now** resends a failed scan right away.
- **Remove** drops a pending or failed scan from the queue after a confirmation prompt, so it's no longer retried. If it already reached the backend, it stays recorded there.
- **Simulate API outage** (dev builds only): a switch that makes every scan fail as if the network were down, to test the retry and offline behavior. Loading the department list isn't affected. The setting applies to all open tabs.
- **← Back to scanning** returns to the scanning screens.

## Backend interaction

### Endpoints

| Call | When | Request | Response |
|---|---|---|---|
| `GET /api/departments` | When the scanning screens open and the department list isn't loaded yet | — | A map keyed by department ID. Each entry has a `description`, `next-departments` (IDs), `wip-locations` (keyed by ID, each with a `description`) and optionally `next-wip-locations`. |
| `POST /api/scans` | On every send or resend of a scan | JSON scan record, plus header `Idempotency-Key: <clientId>` | The scan record echoed back with `scanType`, plus `errorCode` / `errorMessage` / `recorded` on a rejection |

`next-wip-locations` lists, for each next department, which of its physical (WIP) locations the current department may send entities to:
- if a next department isn't listed, all of its locations are allowed;
- if its list is empty, only the department itself is allowed.

**Scan record fields**

| Field | Meaning |
|---|---|
| `clientId` | Unique ID generated by the browser. It is reused for every resend of the same scan. |
| `userName` | From the session. |
| `currentDepartment` | From the session. |
| `entityId` | Entered by the operator. |
| `destinationDepartment` | The next department, or the current department for an informational scan. |
| `destinationWipLocation` | The physical (WIP) location, if one was chosen or typed. |
| `note` | Optional note. |
| `locationConfirmed` | `true` when the operator confirmed a mismatched entity really is here. |
| `correctionReason` | The operator's optional reason, sent with `locationConfirmed`. |

The backend decides `scanType` (`transitional` or `informational`) and returns it in the response.

### How responses are handled

| Response | Result in the UI |
|---|---|
| 200 with no `errorCode` | `success` |
| 200 with `errorCode: ENTITY_LOCATION_MISMATCH` | `mismatch`. The operator confirms or dismisses it. `recorded` says where the backend has the entity: department, physical (WIP) location, who scanned it, and when. |
| 200 with any other `errorCode` (e.g. `ENTITY_ON_HOLD`) | `rejected`. The message shown is `errorMessage`, or the code if there's no message. |
| A mismatch that comes back again after the operator confirmed | `rejected`, since it can't be resolved from the UI |
| No response within 15 seconds | `failed`: "Server did not respond." |
| Network error | `failed`: "Unable to reach the server." |
| Non-2xx status | `failed`, using the server's error text, a JSON `message`, or the status code |

### Reliability

- **Queue first:** a scan goes into the browser's queue before it's sent, so nothing is lost if the page reloads or the network drops. A scan that was still in flight during a reload is marked failed and retried.
- **Automatic retry:** failed scans are retried after 10 seconds, and the wait doubles after each failure (20 s, 40 s, …) up to 5 minutes.
  - When the browser comes back online, all failed scans are retried right away.
  - Retries only run while a scanning screen is open, not on the Admin screen alone.
- **One retrying tab:** when several scanning tabs are open, a browser lock lets only one of them retry at a time.
- **Safe repeats:** every resend uses the same `clientId` as the `Idempotency-Key`. The backend then treats repeats of a scan it already recorded as the same scan, for example when a response was lost.
- **Offline department list:** the last department list loaded is saved in the browser. If the backend can't be reached, the app uses that copy.

## Data kept in the browser

Everything is stored in the browser's `localStorage`, so it's shared by all tabs and survives restarts. Tabs keep each other up to date: a change in one tab shows up in the others.

| Key | Holds |
|---|---|
| `scan-entity.session` | The current session: user name and department |
| `scan-entity.department` | The last department picked, used when the app opens |
| `scan-entity.departments` | The last department list loaded, used offline |
| `scan-entity.history` | The scan queue and history, up to 100 scans |
| `test.apiOutage` | The simulated outage switch (dev builds only) |

## Environments

| | Development | Production |
|---|---|---|
| API | `http://localhost:3000/api/...`, or a built-in mock | Same origin: `/api/departments` and `/api/scans` |
| Simulated outage switch | Available | Hidden, and always off |
| Admin screen | Available | Available (Scan History only) |

**Development mock API:** with the mock turned on, the app runs without a backend. The mock:
- serves a sample department list;
- answers scans after about 2 seconds, and like the real backend treats repeat sends as the same scan;
- loses every 3rd new scan's response after recording it, to exercise retries;
- rejects every 4th, cycling through on hold, location mismatch, and canceled.
