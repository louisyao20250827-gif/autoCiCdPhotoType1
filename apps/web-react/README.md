# web-react(APP 1 與 2)

React 18 + Vite + Tailwind v4 的公開聊天室。同一份程式碼部署成兩個 Vercel 專案,用 `VITE_APP_ID` 切換:

- `1`:一般網頁
- `2`:給 Flutter WebView 載入的精簡版(網址加 `?app_id=4` 時標成 APK 送出)

## 資料流
- **讀**:supabase-js(anon key)直接查 `CHAT_MESSAGES`、`MESSAGE_FEEDBACK`,並用 Realtime 訂閱新訊息與投票。
- **寫**:送訊息、按讚都呼叫 FastAPI。
- 送出時先顯示「傳送中」,API 回應或 Realtime 推回來後用 `client_message_id` 合併成一筆;失敗可用同一個 id 重試,不會重複。
- 斷線重連後會重新抓最新一頁,補上離線期間的訊息。
- 暱稱和裝置投票 ID 存在 localStorage(尚未做登入)。

## 本機開發(需要 Node 20 以上)
```bash
cp .env.example .env.local   # 填入真實值
npm install
npm run dev
npm test
```
