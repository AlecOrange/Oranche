// GET /api/fitbit/callback?code=...
// Fitbit redirects here after the user approves the consent screen.
// Exchanges the one-time code for an access/refresh token pair and
// stores them in Supabase (service-role only — never exposed to the
// browser). Then bounces the user back to daily.html.
const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { getBaseUrl } = require('../_lib/baseUrl');

module.exports = async function handler(req, res) {
  const base = getBaseUrl(req);
  const { code, error } = req.query || {};

  if (error) {
    return redirect(res, `${base}/daily.html?fitbit=error`);
  }
  if (!code) {
    res.statusCode = 400;
    res.end('Missing code');
    return;
  }

  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  const redirectUri = process.env.FITBIT_REDIRECT_URI || `${base}/api/fitbit/callback`;

  if (!clientId || !clientSecret) {
    console.error('Missing FITBIT_CLIENT_ID/FITBIT_CLIENT_SECRET env vars');
    return redirect(res, `${base}/daily.html?fitbit=error`);
  }

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: redirectUri,
      client_id: clientId,
    });

    const tokenRes = await fetch('https://api.fitbit.com/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    const tokenJson = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('Fitbit token exchange failed', tokenJson);
      return redirect(res, `${base}/daily.html?fitbit=error`);
    }

    const expiresAt = new Date(Date.now() + (tokenJson.expires_in || 28800) * 1000).toISOString();
    const supa = getSupabaseAdmin();
    const { error: dbError } = await supa.from('fitbit_tokens').upsert({
      id: 'default',
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expires_at: expiresAt,
      scope: tokenJson.scope || null,
      updated_at: new Date().toISOString(),
    });
    if (dbError) {
      console.error('Failed to store Fitbit tokens', dbError);
      return redirect(res, `${base}/daily.html?fitbit=error`);
    }

    return redirect(res, `${base}/daily.html?fitbit=connected`);
  } catch (e) {
    console.error(e);
    return redirect(res, `${base}/daily.html?fitbit=error`);
  }
};

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}
