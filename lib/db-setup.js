import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function ensureOrderSchema() {
    if (!supabaseUrl || !supabaseKey) {
        return { success: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const sql = `
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  `;

    try {
        // Try standard RPC names for SQL execution (commonly used in Supabase setups)
        const rpcNames = ['exec', 'exec_sql', 'run_sql', 'execute_sql'];

        for (const rpc of rpcNames) {
            const { error } = await supabase.rpc(rpc, { sql });
            if (!error) {
                return { success: true, method: rpc, message: 'Executed SQL successfully via RPC' };
            }
            // If error is NOT "function does not exist", it might be a permission error or syntax error
            const msg = error.message.toLowerCase();
            if (!msg.includes('function') && !msg.includes('does not exist') && !msg.includes('not found')) {
                return { success: false, error: `RPC ${rpc} failed: ${error.message}`, sql };
            }
        }

        // specific fallback message
        return {
            success: false,
            error: 'No SQL execution RPC found. Please run the SQL manually in Supabase SQL Editor.',
            required_sql: sql
        };

    } catch (error) {
        return { success: false, error: error.message, required_sql: sql };
    }
}
