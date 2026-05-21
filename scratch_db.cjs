const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://lcemfzoangvewaahgmcz.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjZW1mem9hbmd2ZXdhYWhnbWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDg3MDYsImV4cCI6MjA4OTY4NDcwNn0.i15yHdH7y4AWIh7TCXzu2URL0zkoQXZCsAZLkJ_4r_s";

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .rpc('get_policies'); // If it doesn't exist, let's select from pg_policies via a generic query or a raw sql RPC if available, or just direct query

  const { data: policies, error: err } = await supabase
    .from('pg_policies') // Usually not exposed via postgrest unless explicitly mapped, let's try
    .select('*')
    .eq('tablename', 'radiology_orders');

  if (err) {
    console.error('Error fetching pg_policies:', err);
    // Let's do another query: what's the definition of radiology_orders? Let's check if we can query some active orders or users to get their hospital_id.
    const { data: users, error: userErr } = await supabase.from('users').select('*').limit(2);
    console.log('Users:', users, 'Error:', userErr);
  } else {
    console.log('Policies on radiology_orders:', policies);
  }
}

main();
