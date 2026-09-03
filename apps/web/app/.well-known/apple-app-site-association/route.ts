const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    apps: [],
    details: [
      {
        appID: '2K9VPW5R27.app.navacloud.nava',
        paths: [
          '/accept-invitation',
          '/accept-invitation/*',
          '/reset-password',
          '/reset-password/*',
        ],
      },
    ],
  },
} as const;

export function GET() {
  return Response.json(APPLE_APP_SITE_ASSOCIATION, {
    headers: {
      'cache-control': 'public, max-age=300',
      'content-type': 'application/json',
    },
  });
}
