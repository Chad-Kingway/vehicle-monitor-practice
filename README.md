# 車輛監控系統

目前提供一台車的本機連線、勤崴 3D 監控地圖，以及由 Server 查詢官方道路路線的整合驗收畫面（任務 01、02）。FastAPI Server 管理設定、模擬輪次與車輛狀態；Python 車輛 Client 透過 HTTP 回報位置與朝向；Vite 網頁透過 HTTP 顯示 Server 資料。關閉監控頁不會停止車輛 Client。

## 環境準備

- Node.js 20.19+ 或 22.12+，Python 3.12+。
- 勤崴 mapThree 1.4.3 的有效 ACCESS_KEY、ACCESS_TOKEN，以及 `http://127.0.0.1:5173` 的來源授權。地圖須連線勤崴服務。
- 本機模型：`public/models/car/scene.gltf`、`scene.bin` 與 glTF 引用的貼圖，保留原相對路徑。目前本機素材已備妥；新 checkout 需另行取得。模型與 `.env` 均由 Git 忽略。

於專案根目錄執行 PowerShell：

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

若 `.env` 已存在，保留原檔，不要執行最後一行。若 `python` 指向 Microsoft Store 捷徑，請改用已安裝的 Python 完整路徑建立 `.venv`。目前工作目錄已建立 `.venv`，可直接使用其 Python。

在 `.env` 填入 `ACCESS_KEY` 與 `ACCESS_TOKEN`。這是瀏覽器 SDK 憑證，會進入前端產物；請使用對應本機來源的憑證。`SERVER_URL` 預設為 `http://127.0.0.1:8000`，供 Vite 的 `/api` HTTP 代理使用。

道路查詢另外設定 `ROUTES_API_KEY`，對應官方 Direction REST 的 `Key`，須具備 Routes 權限。Server 從根目錄 `.env` 讀取，同名環境變數優先；變更後重啟 Server。此欄位不由 Vite 注入前端。2026-10-13 已實測本機原有 Key 可使用 REST，並在忽略的 `.env` 設定此欄位；新 checkout 仍須自行提供有效憑證，不自動沿用 SDK Key。

## 啟動

三個終端機均以本專案根目錄為工作目錄。

1. Server：

   ```powershell
   .\.venv\Scripts\python.exe -m server
   ```

   固定使用單一 worker，監聽 `127.0.0.1:8000`；資料留在記憶體。每次啟動產生新 `run_id`，位置回到設定初始值。HTTP 文件位於 [FastAPI 文件](http://127.0.0.1:8000/docs)。

2. 車輛 Client：

   ```powershell
   .\.venv\Scripts\python.exe -m clients.vehicle --demo
   ```

   `--demo` 從初始位置沿邊長 300 公尺的診斷方形移動，供驗證位置與四個方向；這是連線展示用軌跡。任務 02 僅取得並顯示真實道路路線，車輛沿路線接送於任務 03 交付。基準速度為 5 公尺／秒，套用 Server 的倍率；回報頻率依真實時間計算。省略 `--demo` 則原地回報。以 `Ctrl+C` 停止。

3. 監控網頁：

   ```powershell
   npm run dev
   ```

   開啟 [車輛監控](http://127.0.0.1:5173/)。SDK、地圖或模型失敗時，側欄顯示原因，HTTP 資料仍持續更新。來源、憑證或素材修正後重新整理；變更 `.env` 後重新啟動 Vite。

## 設定與 HTTP

修改 `config/simulation.json` 後重啟 Server 與 Client。目前使用一筆車輛設定；三車車隊於任務 04 交付，監控列表與互動於任務 08 擴充。

| 設定 | 預設 |
| --- | --- |
| 車輛識別碼、載客上限 | `vehicle-01`、4 人 |
| 初始位置、朝向 | `[121.561, 25.0334]`、0° |
| 行駛速度倍率 | 10 |
| 車輛回報、網頁更新 | 各 1 秒 |
| 車輛離線門檻 | 10 秒 |
| 路線查詢時間上限 `route_timeout_seconds` | 10 秒，包含等待併發空位 |
| 路線查詢併發 `route_concurrency_limit` | 1，可調整；此值不代表官方配額 |

座標為 `[經度, 緯度]`；地理朝向為北 0°、東 90°、南 180°、西 270°。模型保留舊素材的 `{ x: 90, y: 180, z: 0 }` 建立校正；依 Server 朝向套用 Z 旋轉，不在瀏覽器執行行駛。

| HTTP | 行為 |
| --- | --- |
| `GET /api/simulation` | 回傳 `run_id`、全域 `settings` 與車輛位置、朝向、最後回報時間、連線狀態 |
| `POST /api/vehicles/{vehicle_id}/reports` | 接收 `{ "run_id": "本輪 UUID", "position": [121.561, 25.0334], "heading": 90 }`，更新該車 |
| `POST /api/routes` | 接收 `{ "origin": [121.561, 25.0334], "destination": [121.517, 25.0478] }`，非同步查詢勤崴 Direction REST |

不同輪次回報回應 409，不存在的車輛回應 404，無效座標／朝向回應 422。最後回報時間由 Server 產生；離線判定使用單調時間，不受系統時鐘校正影響。Client 發現新輪次時重新取得初始狀態。此切片沒有乘車請求或接送任務。

Server 可用 `--config 路徑` 與 `--port 連接埠` 指定啟動設定；Client 可用 `--server HTTP_URL` 與 `--vehicle-id 識別碼` 指定來源。變更 Server 連接埠時也需同步 `.env` 的 `SERVER_URL`。所有應用程式資料通訊使用 HTTP；Vite 的開發 HMR 連線只用於程式碼更新。

## 人工驗收

1. 啟動三個程序，確認側欄出現「Server 已連線」「已連線」「地圖與模型已就緒」，勤崴地圖顯示本機車輛模型。
2. 比對 Client 終端機、`GET /api/simulation` 與側欄的位置及朝向；等待東、北、西、南轉向，確認模型車頭隨回報更新。網頁讀取有一個更新週期的延遲。
3. 關閉監控頁，保持 Server 與 Client 執行；從 Client 輸出或 API 確認位置仍改變。重新開啟網頁，確認載入 Server 當前位置而非重置車輛。
4. 停止 Client 超過 10 秒，側欄顯示離線但保留最後位置。重新啟動 Client 後恢復連線。接送任務斷線規則留待任務 11。
5. 重啟 Server，確認 `run_id` 改變；舊輪次回報應回應 409，且不修改新輪資料。Client 接著讀取新輪並從初始位置回報。
6. 執行 `npm run build`；需要驗證建置產物時，保持 Server 執行，執行 `npm run preview` 並開啟 `http://127.0.0.1:4173`（此來源亦需勤崴授權）。

本專案尚無既有自動測試，依規格不新增測試檔。語法檢查可執行 `node --check src/main.js`、`node --check src/sdk.js`、`node --check src/vehicle-map.js`、`node --check vite.config.js` 與 `.\.venv\Scripts\python.exe -m compileall -q server clients`。

## 道路路線整合驗收

1. 啟動 Server 與 Vite，開啟 [道路路線驗收](http://127.0.0.1:5173/?route-check)。這是整合用入口；一般監控頁隱藏此表單，也不會自動查詢路線。車輛 Client 可另行執行，查詢不依賴它。
2. 按「查詢官方路線」，核對地圖藍線、綠色圓形「起」、紅色方形「迄」，以及側欄的公尺、秒數、道路座標點數。畫面以俯視定位整條路線；瀏覽器直接使用 Server 已解碼的座標，不另查 SDK DirectionsService。
3. 預設起訖 `[121.561, 25.0334]` → `[121.517, 25.0478]` 已於 2026-10-13 實測成功：官方 `HTTP 200 / status OK`，15 個 steps 解碼合併為 105 點，6,064 公尺、999 秒。道路幾何起訖為 `[121.56098, 25.03307]` → `[121.51623, 25.04793]`；官方 leg 的起訖 metadata 為請求點，steps 才是道路投影點。因此標記放在請求點，藍線保留道路投影位置，不補直線。預估時間可能隨查詢時刻改變。
4. 更換一組起訖或對調方向再查詢，確認舊線與標記被清除、只顯示新結果。輸入錯誤座標後查詢，應顯示錯誤，且不保留前次成功線形或數值。
5. 暫時將 `ROUTES_API_KEY` 設為空白／無效值，重啟 Server 再查詢，應顯示缺少憑證／授權遭拒。實測無效 Key 的官方回應為 `HTTP 401 / REQUEST_DENIED`，Server 回應 503；憑證缺漏也回應 503。恢復憑證並重啟後可再查詢。勿將憑證或含 Key 的上游 URL 寫入文件。

`POST /api/routes` 回傳 `provider`、請求 `origin`／`destination`、完整 `coordinates`（均為 `[經度, 緯度]`）、`distance_meters` 與 `duration_seconds`。Server 將請求轉為官方 REST 的 `Origin`／`Destination`（`緯度,經度`），解碼每個 `steps[].polyline.points`（E5），核對 step 起訖與連續性，再加總 leg 的數值距離／時間；不用 overview 簡化線或文字推算。缺失／不連續道路資料回應 502，不產生替代路線；輸入無效回應 422，逾時回應 504，網路／上游異常回應 502，HTTP 授權或頻率拒絕回應 503。此切片每次僅查詢一次；接送失敗後釋放車輛與重試策略留待任務 10。

官方公開 [Starter 方案](https://kwmapdeveloper.localking.com.tw/products) 列出每日 100 次且須管理員核准；登入後才能查閱自己的訂閱。目前本機 Key 的實際方案、每日配額與頻率上限未取得證據，使用者表示目前可能不限次，因此不以公開 Starter 配額當成本機限制，也不宣稱已確認無限使用。已查核 [服務條款](https://kwmapdeveloper.localking.com.tw/maps-service-terms) 的座標暫存期限為 30 天；目前 Server 查詢後直接回傳，未保存第三方路線。人工查核暫存限置於 Git 忽略的 `.local`，驗證後移除。

## 官方介面依據

- [mapThree 初始化](https://kw3dmap.localking.com.tw/3dmap/api/mapThree/info)
- [add3dModel](https://kw3dmap.localking.com.tw/3dmap/api/mapThree/methods#add3dmodel)：使用 `obj`、獨立模型 id 與三維座標。
- [setCoordinates／setRotation](https://kw3dmap.localking.com.tw/3dmap/api/mapThree/model)：依回報設定座標；旋轉相對模型建立基準。
- [Direction REST](https://kwmapdeveloper.localking.com.tw/api-details#api=places-api-prod&operation=get-maps-api-directions-output-key-key)：正式端點為 `GET https://kwmap.localking.com.tw/maps/api/Directions/json`，參數 `Key`、`Origin`、`Destination`、`Mode=driving`、`Language=zh-TW`。基本 Direction 限制最多 10 個 waypoints，指定出發時間等進階需求須使用 Direction Advance；此切片只查起訖兩點。
- [Encoded Polyline](https://developers.google.com/maps/documentation/utilities/polylinealgorithm)：E5 演算法與官方三點範例；已核對解碼結果及真實 REST steps。
- [add3dLine](https://kw3dmap.localking.com.tw/3dmap/api/mapThree/methods#add3dline)、[Marker](https://kw3dmap.localking.com.tw/3dmap/api/marker/info)、[fitBounds](https://kw3dmap.localking.com.tw/3dmap/api/map/methods#fitbounds)：顯示 Server 道路線形、不同起訖標記並定位。
- [Vite HTTP 代理](https://vite.dev/config/server-options#server-proxy)、[FastAPI workers](https://fastapi.tiangolo.com/deployment/server-workers/)。
