
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Fetching variant_templates...');
  const { data: templates, error: tErr } = await supabase
    .from('variant_templates')
    .select(`
      *,
      options:variant_options(*)
    `);

  if (tErr) {
    console.error('Error fetching templates:', tErr);
  } else {
    console.log(`Found ${templates.length} templates.`);
    templates.forEach(t => {
      console.log(`- Template: ${t.name} (ID: ${t.id})`);
      if (t.options && t.options.length) {
        console.log(`  Options: ${t.options.map(o => o.name).join(', ')}`);
      } else {
        console.log('  No options found or relationship failed.');
      }
    });
  }

  // Also check menu_items with variants
  console.log('\nChecking menu items with variants...');
  const { data: items, error: iErr } = await supabase
    .from('menu_item_variants')
    .select(`
       menu_item_id,
       template_id,
       menu_items (name)
    `)
    .limit(5);

  if (iErr) console.error(iErr);
  else {
      items.forEach(i => {
          console.log(`Item "${i.menu_items?.name}" (${i.menu_item_id}) linked to Template ${i.template_id}`);
      });
  }
}

check();
