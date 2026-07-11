// ============================================================================
// STRATA - SUPABASE CLIENT INITIALIZATION
// ============================================================================
/*
 * SECURITY STATEMENT:
 * The Supabase anon/public key below is safe to expose in frontend code because
 * Row Level Security (RLS) policies are active on every database table in Supabase.
 * RLS enforces access control at the database level, meaning that a user can only
 * select, insert, update, or delete their own data in profiles and tasks.
 *
 * CRITICAL CONSTRAINT:
 * This security model only holds true if RLS is enabled and policies are correctly
 * configured and tested for all tables (profiles, tasks, subscription_events) in the
 * database. We must never expose the service_role key in client-side code under any
 * circumstance.
 */
const SUPABASE_URL = "https://uhncfkodfbujttyykdjs.supabase.co"; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVobmNma29kZmJ1anR0eXlrZGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MjM1NTgsImV4cCI6MjA5OTI5OTU1OH0.lNae77FnLHVpM5ry6CmREwAIT6t3FpD3JML55wN2kbQ"; // Replace with your Supabase Anon Key

// Initialize the Supabase client
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (!supabase || SUPABASE_URL.includes("your-supabase-project-url")) {
    console.warn("Strata: Supabase client is not fully configured. Please specify your SUPABASE_URL and SUPABASE_ANON_KEY in supabaseClient.js.");
}
