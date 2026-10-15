# 深色調度控制台 UI 原型

## 目的

建立一個可操作的深色調度控制台原型，沿用既有前端資料流與互動，讓監控頁的替代版面能在保留原版 `index.html` 的同時實際體驗。原型驗證後，再決定是否將 UI DOM 契約定為長期架構規格。

## 介面方向

- 原版 `index.html` 與原有樣式保持不變；新介面由獨立的 `dispatch.html` 開啟。
- 桌面版採資訊優先的寬側欄與右側勤崴地圖。側欄順序為連線狀態與選中車輛、車隊、乘車請求、接送任務、路線驗收、速度與回報設定、模擬資訊及地圖狀態。
- 色彩採石墨底色、青綠操作與正常狀態色、琥珀警示色。地圖底圖維持勤崴 SDK 目前樣式；側欄、地圖說明標籤和地圖控制項使用新風格。
- 窄螢幕維持可操作版面，資訊欄排在地圖之前。
- 監控與 `?passenger=` 乘客流程都可由 `dispatch.html` 使用；乘客頁沿用此風格。

## UI DOM 契約

新介面須滿足既有 JavaScript 使用的 DOM 契約，才能共用資料流程：

- `.monitor` 包含 `.panel` 與 `.map-region`；地圖 SDK 掛載於 `#map`，地圖控制項加到 `#map` 的父層。
- `.panel` 提供 `header`、`.vehicle-card`、`.settings`、`footer`、`.map-caption` 與路線驗收區。
- 監控資料欄位 ID：`connection`、`vehicle-id`、`vehicle-status`、`longitude`、`latitude`、`heading`、`capacity`、`last-report`、`speed`、`report-interval`、`poll-interval`、`run-id`、`map-status`、`map-error`。
- 路線驗收欄位 ID：`route-check`、`route-form`、`route-origin`、`route-destination`、`route-submit`、`route-status`、`route-result`、`route-distance`、`route-duration`、`route-points`、`route-road-start`、`route-road-end`；區塊平時隱藏，透過 `?route-check` 顯示。
- `header` 是新增乘客連結的掛載點；`.vehicle-card` 是車輛操作的掛載點；`.vehicle-card` 前方和 `.settings` 前方會插入動態資料區與設定表單。
- `.panel` 是乘客 Client 重建內容的掛載點；乘客流程會更新 `.map-caption`，且仍需 `#map` 與 map-region。
- 動態區塊的語意 class（`fleet-section`、`request-section`、`task-section`）供兩種 UI 版面安排順序與樣式使用。

## 驗收條件

- `index.html` 保留原本入口和樣式；Vite 建置同時產生 `index.html` 與 `dispatch.html`。
- `dispatch.html` 可載入既有監控資料與操作，新增乘客連結及隨機乘客連結仍留在 `dispatch.html` 路徑。
- `dispatch.html?passenger=<id>` 保留地圖選點、送出請求、查看進度及乘客請求清單。
- `dispatch.html?route-check` 可顯示既有路線驗收欄位。
- 桌面與窄螢幕皆可使用；地圖 SDK 本身不更換、不調整底圖設定。
- 不新增測試檔；完工後提供人工操作方式。
