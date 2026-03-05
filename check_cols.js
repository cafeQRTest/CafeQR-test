const { createClient } = require('@supabase/supabase-js');
const env = require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCols() {
    const { data, error } = await supabase.rpc('get_columns', { table_name: 'restaurant_customers' });
    // Instead of RPC, which might not exist, let's just select 1 row and print keys
    const { data: rowData, error: rowErr } = await supabase.from('restaurant_customers').select('*').limit(1);
    if (rowErr) {
        console.error(rowErr);
    } else if (rowData && rowData.length > 0) {
        console.log("Columns:", Object.keys(rowData[0]));
    } else {
        // try to just select something
        console.log("No data found to infer columns");
    }
}
checkCols();
