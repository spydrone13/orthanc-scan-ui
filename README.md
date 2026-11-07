# OrthancScanUi

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.0.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

`ng serve` proxies `/api` to orthanc-scan-producer on `http://localhost:3000` (`proxy.conf.json`). The API
calls are then same-origin, so the session cookie is sent and Angular adds the `X-XSRF-TOKEN` header the
producer requires on every POST.

With `useMockApi: true` in `src/environments/environment.ts`, the mock API needs a login too: any username,
password `dev`.

## Login

Every producer API call needs a logged-in session. The app checks the session once on load
(`GET /api/auth/me`) and after that learns from 401 responses. Logging in is a dialog, opened from the banner
at the top of the page that shows while the user is logged out.

Scanning works while logged out. Scans are saved as "waiting for login" and no request is sent for them; once
the user logs in, in any tab, they are sent along with any failed scans. While logged out, the app also uses
the stage catalog it saved last time instead of asking the API. If it has none, it opens the login dialog.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

### Code coverage

To run the tests once with coverage, use:

```bash
npm run test:coverage
```

A summary prints in the terminal. Open `coverage/orthanc-scan-ui/index.html` for the per-file HTML report. An `lcov.info` file is also written there for editor plugins and CI tools.

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
