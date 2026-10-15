# 深色調度控制台 UI 原型

## 目的

建立可操作的深色調度控制台原型，並提供一個等待 AI 實作的空白 UI 模板入口。`dispatch.html` 沿用既有前端資料流與互動，原版 `index.html` 保持不變；`ui-template.html` 刻意不載入既有應用，需 AI 依契約實作後才可使用。

## 介面方向

- 原版 `index.html` 與原有樣式保持不變；新介面由獨立的 `dispatch.html` 開啟。
- `ui-template.html`、`src/ui-template.css`、`src/ui-template.js` 是空白起始檔，只提供 `#app` 掛載點；目前不載入 `style.css` 或 `app.js`，沒有監控或乘客功能。AI 依本文件完成 DOM、樣式與初始化程式後，需再驗證監控與乘客流程。
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

- `index.html` 保留原本入口和樣式；Vite 建置同時產生 `index.html`、`dispatch.html` 與 `ui-template.html`。模板入口在 AI 完成實作前是空白頁。
- `dispatch.html` 可載入既有監控資料與操作，新增乘客連結及隨機乘客連結仍留在 `dispatch.html` 路徑。
- `dispatch.html?passenger=<id>` 保留地圖選點、送出請求、查看進度及乘客請求清單。
- `dispatch.html?route-check` 可顯示既有路線驗收欄位。
- 桌面與窄螢幕皆可使用；地圖 SDK 本身不更換、不調整底圖設定。
- 不新增測試檔；完工後提供人工操作方式。

## AI 實作模板使用方式

- AI 從 `ui-template.html`、`src/ui-template.css`、`src/ui-template.js` 開始實作；可自行改排版與風格。
- 完成後須符合本文件「UI DOM 契約」，監控與乘客頁共用同一組掛載點及必要選取器。
- 保留 Vite 的 `ui-template.html` 多頁輸入設定；不得覆寫 `index.html` 或 `dispatch.html`。
- 實作完成後以 `/ui-template.html` 預覽，並人工確認監控、`?passenger=<id>` 與 `?route-check` 流程。
