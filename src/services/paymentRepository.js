const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

let supabase;

function getSupabase() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    const error = new Error('Supabase no está configurado.');
    error.statusCode = 503;
    error.publicMessage = 'La base de datos de pagos no está configurada.';
    throw error;
  }

  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return supabase;
}

async function findById(table, id) {
  const { data, error } = await getSupabase().from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

exports.findCampaign = (id) => findById('campaigns', id);
exports.findCampaignStop = (id) => findById('campaign_stops', id);
exports.findProduct = (id) => findById('products', id);
exports.findParticipant = (id) => findById('participants', id);
exports.findDonation = (id) => findById('donations', id);

exports.findDonationByIdempotencyKey = async (key) => {
  const { data, error } = await getSupabase()
    .from('donations')
    .select('*')
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) throw error;
  return data;
};

exports.createDonation = async (donation) => {
  const { data, error } = await getSupabase().from('donations').insert(donation).select('*').single();
  if (error) throw error;
  return data;
};

exports.updatePendingDonation = async (id, updates) => {
  const { data, error } = await getSupabase()
    .from('donations')
    .update(updates)
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
};