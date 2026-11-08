-- Reference data + 2 dummy chat records.
-- Kept as a migration (not seed.sql) so `supabase db push` puts it on the remote project too.

insert into public."CLIENT_APPS" ("APP_ID", "APP_CODE", "APP_NAME", "PLATFORM", "FRAMEWORK", "DEPLOY_TARGET", "IS_ACTIVE") values
  (1, 'web-react',       'React + Tailwind web',       'web',      'react',   'vercel',          true),
  (2, 'web-webview',     'React web (for WebView)',    'web',      'react',   'vercel',          true),
  (3, 'web-angular',     'Angular + Tailwind web',     'web',      'angular', 'vercel',          false),
  (4, 'flutter-webview', 'Flutter WebView shell APK',  'android',  'flutter', 'github-releases', true),
  (5, 'flutter-native',  'Flutter native APK',         'android',  'flutter', 'github-releases', true),
  (8, 'fastapi',         'FastAPI backend',            'backend',  'fastapi', 'render',          true),
  (9, 'supabase',        'Supabase database',          'database', 'postgres','supabase',        true)
on conflict ("APP_ID") do nothing;

insert into public."CHAT_SESSIONS" ("SESSION_ID", "TITLE", "IS_PUBLIC", "CREATED_FROM_APP_ID") values
  ('00000000-0000-4000-8000-000000000001', '公開大廳', true, 8)
on conflict ("SESSION_ID") do nothing;

insert into public."CHAT_MESSAGES"
  ("MESSAGE_ID", "SESSION_ID", "SENDER_NAME", "SENDER_ROLE", "CONTENT", "APP_ID", "CLIENT_MESSAGE_ID", "CREATED_AT") values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
   'System', 'system', '歡迎來到公開大廳!這是第 1 筆示範訊息。', 8, 'seed-1', '2026-11-08T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001',
   'Demo User', 'user', '這是第 2 筆示範訊息,從網頁或手機輸入的訊息大家都看得到。', 1, 'seed-2', '2026-11-08T00:01:00Z')
on conflict ("MESSAGE_ID") do nothing;
