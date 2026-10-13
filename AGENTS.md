# 專案規範
- 本專案為 `vehicle-monitor-practice` 車輛監控系統，前端使用 Vite + Vanilla JavaScript（HTML / CSS），後端使用 Python + FastAPI，通訊統一使用 HTTP。
- 系統採 Client / Server 架構：Server 管理車輛、需求與任務資料；車輛 Client 負責模擬及回報狀態；乘客 Client 負責提出需求；監控網頁負責顯示 Server 資料。
- 地圖與 3D 模型顯示留在前端；第三方 SDK / API 以官方文件為依據，未確認的介面或服務不得自行假設。
- `../kwmap-practice/` 為舊專案，僅供讀取與參考；所有修改限於本專案，不得修改、刪除或提交舊專案檔案。
- 頁面文字應保持精簡；可由介面、操作流程或元件狀態直接理解的資訊，不要另外加入重複說明。
- 預設不新增測試；只有能指出具體回歸風險，且現有測試無法涵蓋時，才擴充既有測試。新增測試檔須先經我同意。
- 不因一般 UI 調整、重構或提高覆蓋率擴寫測試；保留並執行既有有效測試，不為減少數量而刪除。
- README、docs、註解及 Git commit message 使用繁體中文。
- 每次改動完成後建立 Git commit，並簡單說明人工測試方式。