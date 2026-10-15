# Angular 前端遷移

以學習 Angular 為目的，依 ADR 0003 將前端遷移至 Angular CLI、TypeScript 與 standalone components。以 main 原版為畫面基準，整合各入口功能，舊網址保留相容性；Server、Python Client 與 HTTP 契約維持不變。

Angular service、Signals、HttpClient 與 RxJS 負責前端狀態、HTTP 及輪詢。保留送單識別碼、結果確認、輪次核對、斷線恢復與終止行程車位。地圖位於持續存在的工作區外層，內部操作不得重建；離開工作區時清理 HTTP、事件、地圖及非同步載入資源。

## 驗收

- Angular production build 與型別／模板檢查通過，開發與產物預覽保留 API 代理及固定來源。
- `/`、`/index.html`、`/dispatch.html`、`/ui-template.html` 及乘客、random、route-check 參數可用。
- 保留 main 資訊、模板的搜尋、摘要、查看車輛、手動座標及清除路線操作。
- 實際瀏覽器驗證地圖、選車、乘客送出／取消、調速、斷線恢復與輪次切換；地圖初始化失敗不停止 HTTP。
- 不新增測試檔；明確記錄實際執行及未能執行的驗收。

## Comments

- 2026-10-15：使用者確認完整方案，可連續完成實作。
