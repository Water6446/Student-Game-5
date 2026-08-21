import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/host/CreateSessionForm.tsx", [
(
'''    const payload: SessionConfig = {''',
'''    const payload: CreateSessionPayload = {'''
),
(
'''          ? { managers: drafts as unknown as SessionConfig["managers"], num_managers: drafts.length }''',
'''          ? { managers: drafts, num_managers: drafts.length }'''
),
(
'''export function NewSessionPanel({ supabase }: { supabase: SupabaseClient }) {''',
'''/**
 * What create_session ACCEPTS, which is not what it stores. The host authors
 * alpha, so an edited line-up travels with its true parameters; the server
 * splits it into the public config and the server-only session_secrets.
 */
type CreateSessionPayload = Omit<SessionConfig, "managers"> & { managers?: ManagerDraft[] };

export function NewSessionPanel({ supabase }: { supabase: SupabaseClient }) {'''
),
])

# A host who clears a manager's name must not produce a nameless prospectus.
patch("supabase/migrations/0014_manager_game.sql", [
(
'''      v_priv := v_priv || jsonb_build_array(jsonb_build_object(
        'name',           v_mgr->>'name',''',
'''      v_priv := v_priv || jsonb_build_array(jsonb_build_object(
        'name',           coalesce(nullif(btrim(v_mgr->>'name'), ''), 'Manager ' || (i + 1)),'''
),
(
'''      v_pub := v_pub || jsonb_build_array(jsonb_build_object(
        'name',          v_mgr->>'name',''',
'''      v_pub := v_pub || jsonb_build_array(jsonb_build_object(
        'name',          coalesce(nullif(btrim(v_mgr->>'name'), ''), 'Manager ' || (i + 1)),'''
),
])
