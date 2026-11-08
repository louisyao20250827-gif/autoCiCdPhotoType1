# Chat Log 一條龍

公開聊天室:從網頁或手機輸入的訊息,所有人即時看得到。資料庫先放 2 筆示範訊息。

```
├── apps/web-react         → Vercel(1、2)            尚未建立
├── apps/web-angular       → Vercel(3,目前略過)     尚未建立
├── apps/flutter-webview   → GitHub Actions → APK(4) 尚未建立
├── apps/flutter-native    → GitHub Actions → APK(5) 尚未建立
├── backend/fastapi        → Render(8)
├── supabase/migrations    → GitHub Actions: supabase db push(9)
├── render.yaml            → Render Blueprint
├── docs/API.md            → API 規格 + 即時同步範例
└── .github/workflows      → 依變更路徑觸發,結果寫進 DEPLOY_LOGS
```

## 各 workflow

| 檔案 | 觸發路徑 | 做什麼 |
|---|---|---|
| `supabase-migrate.yml` | `supabase/migrations/**` | dry-run 後 `supabase db push` |
| `backend.yml` | `backend/fastapi/**`、`render.yaml` | pytest → 呼叫 Render deploy hook → 等 `/health` 回報新 commit |
| `flutter-webview-apk.yml` / `flutter-native-apk.yml` | `apps/flutter-*/**` | 編譯 APK → GitHub Release(tag `flutter-xxx-v<run>`) |
| `vercel-deploy-log.yml` | Vercel 回報的 deployment_status | 把網頁部署結果寫進 DEPLOY_LOGS |

網頁本身由 Vercel 的 GitHub 整合自動部署,不需要 workflow。

## 一次性手動設定

1. **Supabase**:建立專案(手動,比 CI 自動建穩定)。
2. **Render**:New → Blueprint → 選這個 repo,會讀 `render.yaml`。在 Render 填入環境變數,並到 Settings 複製 **Deploy Hook URL**。
3. **Vercel**:每個網頁各建一個專案、設定 Root Directory。專案名稱要包含 `web-react` / `web-webview` / `web-angular`,部署紀錄才對得上 APP_ID。
4. **GitHub → Settings → Secrets and variables → Actions**:

| Secrets | 說明 |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Connect → Session pooler 連線字串(含 DB 密碼) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | 只給 CI 寫 DEPLOY_LOGS 用 |
| `SUPABASE_ANON_KEY` | 編進 APK(公開也沒關係,RLS 只允許讀) |
| `RENDER_DEPLOY_HOOK_URL` | Render 的 Deploy Hook |
| `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` | APK 簽章;沒設就用 debug 簽章(只適合內部測試) |

| Variables | 說明 |
|---|---|
| `BACKEND_PUBLIC_URL` | 例如 `https://chatlog-fastapi.onrender.com`;設了才會等新版本上線確認成功 |
| `WEBVIEW_WEB_URL` | 4 號 WebView 殼要載入的網址 |

## 安全

- `service_role` key 只放在 Render 和 GitHub Secrets,**絕不**放進前端或 APK。
- anon key 只能讀(RLS 只有 SELECT policy),所有寫入都經過 FastAPI 驗證與限流。
- 限流是記憶體內計數,Render 重啟就歸零、多台實例不共享;流量變大再換 Redis。

## 本機跑後端

```bash
cd backend/fastapi
pip install -r requirements-dev.txt
pytest -q
uvicorn app.main:app --reload   # 需要先設定 .env.example 裡的環境變數
```

## 目前採用的預設(尚未確認,可改)

- **登入**:暫不登入,送訊息時自填暱稱;`USER_ID` 欄位已預留,之後接 Supabase Auth 不用改表。
- **APK 發布**:GitHub Releases。
- **環境**:只有一套(prod)。
- **Firebase / DEVICE_TOKENS**:依指示略過,表沒有建。
- **APP_ID 8、9**:沿用你的編號,放進 CLIENT_APPS 讓 DEPLOY_LOGS 能關聯。
- **全大寫命名**:保留,SQL 需加雙引號,API 對外一律小寫。
