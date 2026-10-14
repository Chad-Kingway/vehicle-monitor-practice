# 能追出網頁的入口

使用者正確指出 `index.html` 的 `<script type="module" src="/src/main.js">` 是 JavaScript 入口，且沒有 `passenger` 網址參數時 `src/main.js` 會呼叫 `mountMonitor()`。後續可以從模組路徑與函式呼叫開始，逐步追到畫面更新與 HTTP 資料流。
