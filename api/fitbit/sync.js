// GET or POST /api/fitbit/sync
// Pulls today's activity/heart-rate/sleep data from the Fitbit Web API,
// refreshing the stored access token first if it's near expiry, then
// writes a processed summary into Supabase (public.app_state, key
// "daily") so daily.html can render instantly from cache on every load
// instead of waiting on Fitbit's API each time.
const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');

const FITBIT_API = 'https://api.fitbit.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  try {
    const supa = getSupabaseAdmin();
    const { data: tokenRow, error: tokenErr } = await supa
      .from('fitbit_tokens')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (tokenErr) throw tokenErr;
    if (!tokenRow) {
      return sendJson(res, 401, { error: 'not_connected' });
    }

    let accessToken = tokenRow.access_token;
    const expiresAt = new Date(tokenRow.expires_at).getTime();

    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      const refreshed = await refreshFitbitToken(tokenRow.refresh_token);
      if (!refreshed) {
        return sendJson(res, 401, { error: 'refresh_failed' });
      }
      accessToken = refreshed.access_token;
      await supa
        .from('fitbit_tokens')
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: new Date(Date.now() + (refreshed.expires_in || 28800) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'default');
    }

    const summary = await fetchFitbitSummary(accessToken);

    const { data: existing } = await supa.from('app_state').select('data').eq('key', 'daily').maybeSingle();
    const merged = Object.assign({}, existing && existing.data, { fitbit: summary });
    await supa.from('app_state').upsert(
      { key: 'daily', data: merged, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

    return sendJson(res, 200, { ok: true, summary });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: 'sync_failed', message: String((e && e.message) || e) });
  }
};

async function refreshFitbitToken(refreshToken) {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const r = await fetch(`${FITBIT_API}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!r.ok) {
    console.error('Fitbit token refresh failed', await r.text());
    return null;
  }
  return r.json();
}

async function fitbitGet(path, accessToken) {
  const r = await fetch(`${FITBIT_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    throw new Error(`Fitbit GET ${path} -> ${r.status}`);
  }
  return r.json();
}

async function fetchFitbitSummary(accessToken) {
  const [activityR, heartR, sleepR] = await Promise.allSettled([
    fitbitGet('/1/user/-/activities/date/today.json', accessToken),
    fitbitGet('/1/user/-/activities/heart/date/today/1d.json', accessToken),
    fitbitGet('/1.2/user/-/sleep/date/today.json', accessToken),
  ]);

  const activity = activityR.status === 'fulfilled' ? activityR.value : {};
  const heart = heartR.status === 'fulfilled' ? heartR.value : {};
  const sleep = sleepR.status === 'fulfilled' ? sleepR.value : {};

  const s = activity.summary || {};
  const heartValue =
    (heart['activities-heart'] && heart['activities-heart'][0] && heart['activities-heart'][0].value) || {};
  const sleepSummary = sleep.summary || {};
  const mainSleep = (sleep.sleep || []).find((x) => x.isMainSleep) || (sleep.sleep || [])[0] || null;
  const totalDistance = (s.distances || []).find((d) => d.activity === 'total');

  const workouts = (activity.activities || []).map((a) => ({
    name: a.name,
    durationMin: Math.round((a.duration || 0) / 60000),
    calories: a.calories || 0,
    startTime: a.startTime || null,
  }));

  return {
    date: activity['activities-date'] || todayKey(),
    steps: s.steps || 0,
    stepsGoal: (activity.goals && activity.goals.steps) || 10000,
    caloriesOut: s.caloriesOut || 0,
    activeMinutes: (s.fairlyActiveMinutes || 0) + (s.veryActiveMinutes || 0),
    sedentaryMinutes: s.sedentaryMinutes || 0,
    distanceKm: totalDistance ? totalDistance.distance : 0,
    restingHeartRate: heartValue.restingHeartRate || null,
    heartZones: heartValue.heartRateZones || [],
    sleepMinutes: sleepSummary.totalMinutesAsleep || (mainSleep ? mainSleep.minutesAsleep : 0) || 0,
    sleepEfficiency: mainSleep ? mainSleep.efficiency : null,
    sleepStages: mainSleep && mainSleep.levels && mainSleep.levels.summary ? mainSleep.levels.summary : null,
    workouts,
    syncedAt: new Date().toISOString(),
  };
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}
