// GET /api/fitbit/status
// Tells the browser whether a Fitbit account is connected, without ever
// exposing the tokens themselves (fitbit_tokens has no anon RLS policies).
const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');

module.exports = async function handler(req, res) {
  try {
    const supa = getSupabaseAdmin();
    const { data } = await supa.from('fitbit_tokens').select('updated_at').eq('id', 'default').maybeSingle();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ connected: !!data, connectedAt: data ? data.updated_at : null }));
  } catch (e) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ connected: false, error: String((e && e.message) || e) }));
  }
};
