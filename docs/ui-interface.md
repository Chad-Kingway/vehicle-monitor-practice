# Angular UI 接入契約

依 ADR 0003，以 main 原版為畫面基準，統一監控與乘客介面。舊版 Vanilla JavaScript 呈現程式與 `createUiClient` 已由 Angular 元件及服務取代；本文件取代原先獨立 UI 設計與保留多套入口實作的要求。

## 元件與服務

- `WorkspaceComponent` 提供工作區範圍的 `SimulationService`，持有穩定的地圖容器；監控與乘客元件依網址模式呈現。
- 元件注入 `SimulationService`，從 `state()` 讀取唯讀 signal，從 `actions` 呼叫選車、跟隨、送出、取消、調速、間隔、路線與圖層操作。狀態及方法型別以 `src/app/models.ts` 為準。
- `ApiService` 是唯一的應用程式 HTTP 接點，使用 Angular HttpClient；錯誤保留 Server 的 detail 與 HTTP status，取消訂閱會中止請求。地圖與模型資產由 SDK 封裝載入。
- 表單草稿留在對應元件，系統快照、連線、請求確認與選車留在服務。元件不直接修改 signal 的快照，不自行另外輪詢。
- 非同步操作須處理 rejection；服務保存操作錯誤供畫面呈現。busy、pending、canEditTrip、canSubmit 與 canCancel 決定操作鎖定，送出結果未確認時不可另建新單。

## 網址與生命週期

`/` 與 `/index.html` 開啟同一應用程式，`/dispatch.html` 與 `/ui-template.html` 導向 `/` 並保留 query 與 hash。沒有 passenger 時為監控；`?passenger=<識別碼>` 為乘客；`random=1` 於首次成功連線後消耗並嘗試送出一筆隨機請求。`?route-check` 僅在監控顯示道路查詢。`passengerUrl({ random })` 每次產生新的乘客識別碼，監控開乘客頁仍使用獨立分頁。

Angular render 完成後由外層呼叫 `start()` 與 `mountMap(container)`。每個工作區一張地圖，容器須連接文件且具有尺寸；搜尋、清單與表單重繪不得替換容器。SDK 初始化失敗時 HTTP 仍持續更新，修正環境後重新整理。

服務使用 RxJS timer 在上一輪完成後安排下一輪，保留舊快照直到新資料成功；輪次不一致或被新操作超越的回應不寫入畫面。乘客 pending 識別碼先存 localStorage，再送出 HTTP；重新整理或斷線恢復時核對原次請求。已結束行程保留結束當時的承接車位置。

工作區內切換保留地圖。Angular DestroyRef 清理 HTTP、排程、window 監聽與地圖；map.remove、map.off、remove3dObject 依 SDK 官方文件使用。模型與地圖晚到時不得重新掛回已離開的工作區。pagehide 暫停 HTTP，BFCache 的 pageshow 恢復時繼續原工作區；分頁關閉由瀏覽器釋放整個文件。

## 功能與驗證

保留 main 的車隊、接送任務、請求、選車詳細資訊與設定，補入舊模板的摘要、搜尋、查看車輛、手動座標、清除查詢路線及進度條。地圖與模型比例偏好仍依監控／乘客模式分開保存。

`npm run build` 執行嚴格型別及模板檢查。人工流程見 `docs/manual-acceptance.md` 的 Angular 遷移章節；不得以建置成功代替真實地圖與 HTTP 互動驗收。
