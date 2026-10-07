/** Served by orthanc-scan-producer alongside its API, so same-origin paths work in any plant. */
export const environment = {
  useMockApi: false,
  lotStagesUrl: '/api/lot-stages',
  scanUrl: '/api/scans',
  enableAdmin: false,
};
