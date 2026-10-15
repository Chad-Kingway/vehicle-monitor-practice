# UI 原型與模板入口

- 原版入口為 `index.html`；已完成的調度台原型為 `dispatch.html`。
- `ui-template.html`、`src/ui-template.css`、`src/ui-template.js` 保持空白，等待另一個 AI 實作。
- 新 UI 的唯一接入契約為 [UI 最小接入契約](../../docs/ui-interface.md)，資料與方法型別見 `src/ui-client.d.ts`。
- 新 UI 不需沿用舊 DOM 的 ID、class、區塊結構或視覺設計；以 `src/ui-client.js` 取得狀態、執行操作及掛載地圖。
- Vite 建置保留三個 HTML 入口，以 `/ui-template.html` 預覽新 UI。
