const { createClient } = require('@supabase/supabase-js');

let client = null;

function getSupabase() {
    if (!client) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
        }
        client = createClient(url, key);
    }
    return client;
}

module.exports = { getSupabase };
