# Mission: 看懂並能修改車輛監控專案

## Why
我想從頭弄懂這個專案的網頁是怎麼啟動、程式如何分工與互相傳資料，最後可以自己讀懂並修改它。

## Success looks like
- 能從 `index.html` 追到瀏覽器執行的 JavaScript 入口。
- 能沿著前端 HTTP 請求找到 FastAPI 的處理程式與資料更新位置。
- 能在理解影響範圍後，自己完成一個小型修改並說明資料流。

## Constraints
- 以本機 `vehicle-monitor-practice` 實際程式為主，繁體中文解釋，循序漸進。
- 每次一個小概念，搭配短練習；先不改產品程式。

## Out of scope
- 暫不深入第三方地圖 SDK、部署上線與大型架構重整。
