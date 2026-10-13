# 由 Server 統一規劃接送路線

舊專案在瀏覽器透過地圖 SDK 查詢路線；本專案改由 Server 使用勤崴官方 Routes REST 介面規劃接人與送人路線，再交給 Python 車輛 Client 模擬，讓行駛不依賴監控網頁是否開啟。相較由各車輛 Client 分別查詢，此分工可集中管理第三方服務憑證與查詢併發限制。第一版使用單一 worker 維持記憶體資料一致性，並以非同步 HTTP 與可設定的併發上限處理路線查詢；實際服務權限與限制仍須驗證。

官方介面依據：[Direction 文件](https://kwmapdeveloper.localking.com.tw/api-details#api=places-api-prod&operation=get-maps-api-directions-output-key-key)。
