// GET /api/fitbit/authorize
// Redirects the browser into Fitbit's OAuth consent screen. Client ID is
// not a secret, but keeping it server-side means nothing Fitbit-specific
// has to be hardcoded into daily.html.
const { getBaseUrl } = require('../_lib/baseUrl');

const SCOPES = ['activity', 'heartrate', 'sleep', 'profile'].join(' ');

module.exports = function handler(req, res) {
  const clientId = process.env.FITBIT_CLIENT_ID;
  if (!clientId) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'missing_client_id' }));
    return;
  }

  const redirectUri = process.env.FITBIT_REDIRECT_URI || `${getBaseUrl(req)}/api/fitbit/callback`;

  const url = new URL('https://www.fitbit.com/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', SCOPES);

  res.writeHead(302, { Location: url.toString() });
  res.end();
};
