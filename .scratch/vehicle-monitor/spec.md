# 車輛監控系統規格

Status: draft

## 既定規範

- 前端使用 Vite + Vanilla JavaScript（HTML / CSS），後端使用 Python + FastAPI，通訊統一使用 HTTP。
- Server 管理車輛、需求與任務資料；車輛 Client 負責模擬及回報狀態；乘客 Client 負責提出需求；監控網頁負責顯示 Server 資料。
- 地圖與 3D 模型顯示留在前端；第三方 SDK / API 須以官方文件確認。
- `../kwmap-practice/` 僅供讀取與參考；所有修改限於本專案。

## 已確認需求

- 乘車請求包含上車點、下車點與乘車人數。
- 第一版以同一台電腦執行 Server、車輛 Client、乘客 Client 與監控網頁，完成模擬展示。
- 使用模擬車輛與乘客資料。
- Server 使用記憶體保存資料；重啟後清空車輛狀態、需求與任務，重新開始模擬。

## 尚待釐清

派車方式、任務與車輛的關係、Client 執行形式、地圖選擇及其後續行為尚未確認；本文件仍在討論中。

## Comments

- Q2、Q3、Q4：使用者確認乘車請求定義、本機模擬展示與 Server 重啟後重新開始。
