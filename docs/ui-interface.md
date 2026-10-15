# UI 最小接入契約

從空白起點獨立設計 `ui-template.html`、`src/ui-template.css`、`src/ui-template.js`，目的是探索不同 AI 自己提出的 UI 設計。本文只規定功能接入方式，不提供視覺範本。

## 獨立設計要求

- 先閱讀本文與 `src/ui-client.d.ts`，自行決定資訊架構、導覽、版面、配色、字體、元件及 DOM 結構。模板若已有畫面，可重新建立，無須延續先前設計。
- 不要閱讀、複製或仿照 `index.html`、`dispatch.html`、`src/style.css`、`src/dispatch-style.css`，或 `src/monitor.js`、`src/passenger.js`、`src/ui.js` 產生的畫面來設計新 UI。只替原版換色、換字體或調整間距，不符合本次目的。
- 系統功能透過 `src/ui-client.js` 接入。新 UI 不得直接載入 `src/main.js`、`src/dispatch.js`、`src/app.js`、上述既有畫面程式或樣式；呈現與事件綁定須自行實作。共用模組內部的相依檔案由共用模組管理。
- 保留原版入口、調度台入口及共用模組。接入有疑問時可查閱 `src/ui-client.js`，不要藉由修改共用介面或套用既有頁面完成新 UI。

## 接入

```js
import { createUiClient } from "./ui-client.js";

const client = createUiClient();
client.subscribe(state => render(state)); // render 由 UI 實作者提供；訂閱時立即呼叫
client.start();
await client.mountMap(mapElement); // 提供自己的 DOM 元素
```

每頁建立一個 client、一張地圖；地圖容器須已掛在文件上且寬高大於零。SDK 管理容器內部，UI 不可在重繪時替換該元素。地圖初始化失敗後重新整理頁面。透過 Vite 開啟 `/ui-template.html`；SDK 憑證及 Server 代理沿用專案設定。

URL 沒有 `passenger` 時為監控；`?passenger=<識別碼>` 為乘客。`client.passengerUrl()` 產生同入口的新乘客 URL，`{ random: true }` 代表連線後自動提出一筆隨機請求。`?route-check` 對應 `state.routeCheck`，供 UI 判斷是否顯示路線查詢。

## 讀取

UI 所需欄位與方法型別見 [ui-client.d.ts](../src/ui-client.d.ts)。狀態視為唯讀，由 `subscribe` 接收更新，也可用 `getState()` 立即讀取；訂閱回傳取消訂閱函式。

| 狀態 | 用途 |
| --- | --- |
| `snapshot` | 初始為 null；成功連線後有 run_id、settings、vehicles、requests、tasks。乘客模式的 requests 只有自己的目前請求 |
| `connection`、`error`、`message` | 連線、操作錯誤及確認結果；斷線保留最後成功資料 |
| `selectedVehicle`、`selectedTask`、`following` | 監控選車；乘客則為承接車與目前任務。乘客行程結束後保留當時車位 |
| `currentRequest`、`points` | 乘客目前請求、草稿起訖；地圖依序選上車點、下車點 |
| `busy`、`pending`、`canEditTrip`、`canSubmit`、`canCancel` | 操作鎖定與可操作狀態；pending 表示原次送出結果仍在確認，勿另送一筆 |
| `map`、`route` | 地圖狀態／錯誤／偏好，以及路線查詢結果；地圖失敗不停止 HTTP 資料更新 |

座標統一為 `[經度, 緯度]`，朝向為北 0°、東 90°，進度為 0～1。狀態值及資料欄位見型別檔，顯示文字由 UI 決定。

## 操作

呼叫 `client.actions.<方法>`。方法可能拋出 Error；非同步操作以 `try { await ... } catch (error) { ... }` 接住。busy 時避免重複觸發非同步操作；參數錯誤由方法或 Server 拒絕。

| 方法 | 要求 |
| --- | --- |
| `selectVehicle(id)` | 監控選車；地圖同步該車任務 |
| `follow(boolean)`、`locate()` | 跟隨或定位目前選車／承接車 |
| `setPoints({ pickup, destination })` | 乘客修改草稿；省略的點清空，無參數為重新選點。須 canEditTrip |
| `submitRequest(人數)` | 須 canSubmit；人數為正整數 |
| `submitRandomRequest()` | 須 canEditTrip；起訖與人數由 Server 決定 |
| `cancelRequest()` | 須 canCancel；取消目前等待派車的請求 |
| `setSpeed(倍率)` | 監控；1～300 整數，連續輸入由 UI 合併後送出 |
| `setIntervals(回報秒數, 更新秒數)` | 監控；各為 0.1～60、以 0.05 秒遞增；回報間隔小於 offline_threshold_seconds |
| `queryRoute(起點, 終點)`、`clearRoute()` | 監控查詢道路；結果由模組繪製。清除查詢後恢復目前行程顯示 |
| `setMapPreferences({ poi, scale })` | 地圖 ready 後；poi 為布林值，scale 為 1～100 整數。依 map.preferences 的 Disabled 欄位停用失敗控制項 |

模組負責 HTTP 輪詢、輪次核對、送單識別碼、原次請求確認、地圖模型與行程同步；UI 負責呈現、事件綁定及輸入狀態。`stop()` 停止輪詢並中止進行中的 HTTP，`start()` 可恢復；地圖及選車保留至換頁。頁面離開／返回時由模組處理暫停／恢復。
