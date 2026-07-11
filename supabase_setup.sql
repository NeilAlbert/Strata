-- ============================================================================
-- STRATA - SUPABASE DATABASE SETUP & SECURITY CONFIGURATION
-- Run this in the Supabase SQL Editor.
-- ============================================================================

-- 1. Drop existing objects if they exist (clean setup)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.get_platform_stats();
DROP FUNCTION IF EXISTS public.delete_user(UUID);
DROP FUNCTION IF EXISTS public.is_admin();
DROP TABLE IF EXISTS public.subscription_events;
DROP TABLE IF EXISTS public.tasks;
DROP TABLE IF EXISTS public.profiles;

-- 2. Create Profiles Table (extends auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    name TEXT NOT NULL,
    student_id TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    streak_count INT NOT NULL DEFAULT 0,
    last_completion_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create Tasks Table (replaces localStorage tasks)
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    deadline DATE NOT NULL,
    done BOOLEAN NOT NULL DEFAULT false,
    focus_today BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create Subscription Events Table (optional premium tracking)
CREATE TABLE public.subscription_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    event_type TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Enable Row Level Security (RLS) on all tables (Security Gate)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- 6. Helper Function: Check if requesting user is admin (Avoids infinite recursion in RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger Function: Auto-create Profile on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, student_id, plan, role, streak_count, last_completion_date)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', 'New Student'),
        COALESCE(new.raw_user_meta_data->>'student_id', new.email),
        'free',
        'user',
        0,
        NULL
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Trigger Function: Prevent non-admins from updating critical profile fields (role)
CREATE OR REPLACE FUNCTION public.check_profile_changes()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
    -- If not an admin, check that role is not modified
    IF NOT public.is_admin() THEN
        IF OLD.role IS DISTINCT FROM NEW.role THEN
            RAISE EXCEPTION 'Only administrators can modify user roles.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_profile_security
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.check_profile_changes();

-- 9. Row Level Security Policies

-- Profiles Policies
CREATE POLICY "Allow individual select own or admin select all" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Allow individual update own or admin update all" ON public.profiles
    FOR UPDATE USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (auth.uid() = id OR public.is_admin());

-- Tasks Policies
CREATE POLICY "Users can select own tasks or admin select all" ON public.tasks
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Users can insert own tasks or admin insert all" ON public.tasks
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Users can update own tasks or admin update all" ON public.tasks
    FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Users can delete own tasks or admin delete all" ON public.tasks
    FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- Subscription Events Policies
CREATE POLICY "Users can select own subscription events or admin select all" ON public.subscription_events
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Users can insert own subscription events or admin insert all" ON public.subscription_events
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- 10. RPC: Fetch Aggregated Platform Stats (Admin Only)
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS TABLE (
    total_users BIGINT,
    active_users_7d BIGINT,
    free_users BIGINT,
    premium_users BIGINT,
    total_tasks BIGINT,
    completed_tasks BIGINT
) SECURITY DEFINER AS $$
BEGIN
    -- Check if requesting user is an admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Administrator privileges required.';
    END IF;

    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM public.profiles) AS total_users,
        (SELECT COUNT(*) FROM public.profiles WHERE last_login_at >= now() - INTERVAL '7 days') AS active_users_7d,
        (SELECT COUNT(*) FROM public.profiles WHERE plan = 'free') AS free_users,
        (SELECT COUNT(*) FROM public.profiles WHERE plan = 'premium') AS premium_users,
        (SELECT COUNT(*) FROM public.tasks) AS total_tasks,
        (SELECT COUNT(*) FROM public.tasks WHERE done = true) AS completed_tasks;
END;
$$ LANGUAGE plpgsql;

-- 11. RPC: Delete User Account (Admin Only - bypasses client-side service role key expose)
CREATE OR REPLACE FUNCTION public.delete_user(user_uuid UUID)
RETURNS VOID SECURITY DEFINER AS $$
BEGIN
    -- Check if requesting user is an admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Administrator privileges required.';
    END IF;

    -- Delete from auth.users (cascades to public.profiles and public.tasks)
    DELETE FROM auth.users WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql;
