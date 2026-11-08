-- Trigger functions are SECURITY DEFINER; they must not be callable via /rest/v1/rpc.
-- Triggers still fire (they run as the table owner, not via EXECUTE grants to API roles).
revoke execute on function public.touch_session_last_message() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
