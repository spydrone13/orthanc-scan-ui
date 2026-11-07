/**
 * `ng serve` proxies /api to orthanc-scan-producer on port 3000 (proxy.conf.json), so these paths are
 * same-origin: the session cookie is sent and Angular adds the X-XSRF-TOKEN header by itself.
 */
export const environment = {
  useMockApi: false,
  lotStagesUrl: '/api/lot-stages',
  scanUrl: '/api/scans',
  authUrl: '/api/auth',
  enableOutageSimulation: true,
};
