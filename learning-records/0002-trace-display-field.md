# 能把車輛資料追到 HTML 欄位

使用者在 `src/monitor.js` 正確找到 `byId("longitude").textContent = vehicle.position[0].toFixed(6);`，辨認出 `position[0]` 是畫面顯示的經度，且 `textContent` 負責更新文字。已能沿著 HTML id 與 JavaScript DOM 更新追查一個顯示欄位；接著可學習 UI 修改還涉及哪些層（結構、樣式、互動與資料）。
