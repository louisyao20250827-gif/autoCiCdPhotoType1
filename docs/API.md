# Chat Log API 規格(FastAPI,部署在 Render)

## 讀寫分工

| 動作 | 走哪裡 | 原因 |
|---|---|---|
| **讀**訊息、即時收新訊息 | 前端/APK 直接連 Supabase(anon key + Realtime) | 最快、所有人即時同步 |
| **寫**訊息、按讚 | 一律呼叫 FastAPI | anon key 沒有任何寫入權限(RLS 只開 SELECT),FastAPI 負責驗證、限流、防重送 |
| 部署紀錄 | GitHub Actions 直接寫 Supabase | 不依賴後端是否正在重新部署 |

API 的 JSON 欄位一律小寫 snake_case,資料庫欄位是全大寫,轉換只在 `backend/fastapi/app/schemas.py`。

公開大廳的固定 `session_id`:`00000000-0000-4000-8000-000000000001`

## Endpoints

### `GET /health`
```json
{ "status": "ok", "commit": "<Render 部署中的 git SHA>" }
```

### `GET /api/apps`
回傳 CLIENT_APPS(1~5 前端、8 FastAPI、9 Supabase)。

### `GET /api/sessions`
回傳所有公開對話串,依最後訊息時間排序。

### `GET /api/sessions/{session_id}/messages?limit=50&before=<ISO時間>`
- 取最新 `limit` 筆(1~200,預設 50),由舊到新排序
- 往上捲載入更舊的:把目前最舊一筆的 `created_at` 當 `before`
- 404:對話串不存在或非公開

```json
[
  {
    "message_id": "uuid",
    "session_id": "uuid",
    "parent_message_id": null,
    "sender_name": "Demo User",
    "sender_role": "user",
    "content": "...",
    "app_id": 1,
    "client_message_id": "seed-2",
    "created_at": "2026-11-08T00:01:00Z"
  }
]
```

### `POST /api/sessions/{session_id}/messages`
```json
{
  "sender_name": "小明",
  "content": "大家好",
  "app_id": 5,
  "client_message_id": "可選,建議前端產生 UUID",
  "parent_message_id": null
}
```
- `sender_name` 1~50 字、`content` 1~4000 字,去頭尾空白後不可為空
- `app_id` 只接受 1~5(標示訊息從哪個前端送出)
- `client_message_id`:同一個值重送不會重複新增,回傳原本那筆(**201** 新增 / **200** 已存在)。手機網路不穩時重試請帶同一個值
- 422 驗證失敗、404 對話串不存在、429 太頻繁(每個 IP 每分鐘預設 20 次)

### `POST /api/messages/{message_id}/feedback`
```json
{ "voter_key": "裝置隨機 ID(之後有登入改用 user id)", "rating": 1 }
```
`rating` 只能是 `1`(讚)或 `-1`(倒讚)。同一 `voter_key` 對同一訊息只算一票,再送一次會覆蓋。回傳:
```json
{ "message_id": "uuid", "up": 3, "down": 1 }
```

### `GET /api/messages/{message_id}/feedback`
回傳同上的讚/倒讚統計。

### `GET /api/deploy-logs?app_id=8&limit=20`
最近的部署紀錄。

### 錯誤格式
FastAPI 標準 `{"detail": ...}`;Supabase 出錯時回 502 `{"detail": "database error", "upstream": ...}`。

## 即時同步(所有人一起看到)

前端用 anon key 訂閱 `CHAT_MESSAGES` 的 INSERT,收到就附加到畫面;自己送出的訊息也會從這裡回來,用 `client_message_id` 去重即可。

**React(supabase-js)**
```ts
supabase
  .channel('lobby')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'CHAT_MESSAGES',
        filter: 'SESSION_ID=eq.00000000-0000-4000-8000-000000000001' },
      (payload) => addMessage(payload.new))   // payload.new 欄位是全大寫
  .subscribe();
```

**Flutter(supabase_flutter)**
```dart
supabase
  .channel('lobby')
  .onPostgresChanges(
    event: PostgresChangeEvent.insert,
    schema: 'public',
    table: 'CHAT_MESSAGES',
    filter: PostgresChangeFilter(
      type: PostgresChangeFilterType.eq,
      column: 'SESSION_ID',
      value: '00000000-0000-4000-8000-000000000001'),
    callback: (p) => addMessage(p.newRecord),
  )
  .subscribe();
```
