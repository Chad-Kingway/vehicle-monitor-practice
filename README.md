# 車輛監控系統

本機 Client / Server 接送模擬：FastAPI 管理車隊、乘車請求、接送任務與官方道路規劃；獨立 Python 車隊程式沿路線行駛與回報；乘客頁提出請求；監控頁顯示勤崴 3D 地圖。關閉監控頁不會停止車輛 Client。

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
   .\.venv\Scripts\python.exe -m clients.vehicle
   ```

   預設啟動設定中的所有車輛，也可用 `--vehicle-id vehicle-01` 單獨啟動一台。各車保留獨立任務與進度，以官方預估時間及道路折線內插行駛，套用 Server 的速度倍率。回報頻率依真實時間計算，以 `Ctrl+C` 停止。`--demo` 僅供方形位置／朝向診斷，不用於接送驗收。

3. 監控網頁：

   ```powershell
   npm run dev
   ```

   開啟 [車輛監控](http://127.0.0.1:5173/)。SDK、地圖或模型失敗時，側欄顯示原因，HTTP 資料仍持續更新。來源、憑證或素材修正後重新整理；變更 `.env` 後重新啟動 Vite。

## 設定與 HTTP

修改 `config/simulation.json` 的一般設定後重啟 Server 與 Client。預設三台四人座車輛，各車識別碼、容量與固定初始位置可設定；監控頁可即時調整速度及保存回報／更新間隔。

| 設定 | 預設 |
| --- | --- |
| 車輛識別碼、載客上限 | `vehicle-01`～`vehicle-03`、各 4 人 |
| 初始位置、朝向 | `[121.561, 25.0334]`、0° |
| 行駛速度倍率 | 60 |
| 車輛回報、網頁更新 | 各 0.25 秒；監控頁可保存 0.1～60 秒、步進 0.05 秒，回報間隔須小於離線門檻 |
| 車輛離線門檻 | 10 秒 |
| 路線查詢時間上限 `route_timeout_seconds` | 10 秒，包含等待併發空位 |
| 路線查詢併發 `route_concurrency_limit` | 1，可調整；此值不代表官方配額 |

座標為 `[經度, 緯度]`；地理朝向為北 0°、東 90°、南 180°、西 270°。模型保留舊素材的 `{ x: 90, y: 180, z: 0 }` 建立校正；依 Server 朝向套用 Z 旋轉，不在瀏覽器執行行駛。

| HTTP | 行為 |
| --- | --- |
| `GET /api/simulation` | 回傳 `run_id`、全域 `settings` 與車輛位置、朝向、最後回報時間、連線狀態 |
| `POST /api/vehicles/{vehicle_id}/reports` | 接收 `{ "run_id": "本輪 UUID", "position": [121.561, 25.0334], "heading": 90 }`，更新該車 |
| `POST /api/routes` | 接收 `{ "origin": [121.561, 25.0334], "destination": [121.517, 25.0478] }`，非同步查詢勤崴 Direction REST |

不同輪次回報回應 409，不存在的車輛回應 404，無效座標／朝向回應 422。最後回報時間由 Server 產生；離線判定使用單調時間，不受系統時鐘校正影響。Client 發現新輪次時重新取得初始狀態。

Server 可用 `--config 路徑` 與 `--port 連接埠` 指定啟動設定；Client 可用 `--server HTTP_URL` 與 `--vehicle-id 識別碼` 指定來源。變更 Server 連接埠時也需同步 `.env` 的 `SERVER_URL`。所有應用程式資料通訊使用 HTTP；Vite 的開發 HMR 連線只用於程式碼更新。

## 人工驗收

1. 啟動三個程序，確認側欄出現「Server 已連線」「已連線」「地圖與模型已就緒」，勤崴地圖顯示本機車輛模型。
2. 比對 Client 終端機、`GET /api/simulation` 與側欄的位置及朝向；等待東、北、西、南轉向，確認模型車頭隨回報更新。網頁讀取有一個更新週期的延遲。
3. 關閉監控頁，保持 Server 與 Client 執行；從 Client 輸出或 API 確認位置仍改變。重新開啟網頁，確認載入 Server 當前位置而非重置車輛。
4. 停止 Client 超過 10 秒，側欄顯示離線並保留最後位置；執行中的原任務顯示進度待確認。同輪斷線驗收應只阻斷 HTTP 並保持 Client 存活，不能用 Server 重啟代替。
5. 重啟 Server，確認 `run_id` 改變；舊輪次回報應回應 409，且不修改新輪資料。Client 接著讀取新輪並從初始位置回報。
6. 執行 `npm run build`；需要驗證建置產物時，保持 Server 執行，執行 `npm run preview` 並開啟 `http://127.0.0.1:4173`（此來源亦需勤崴授權）。

本專案尚無既有自動測試，依規格不新增測試檔。語法檢查可執行 `node --check src/main.js`、`node --check src/sdk.js`、`node --check src/vehicle-map.js`、`node --check vite.config.js` 與 `.\.venv\Scripts\python.exe -m compileall -q server clients`。完整流程與實際驗收結果見 [第一版整合驗收](docs/manual-acceptance.md)。

## 乘客、生成器與重新開始

從監控頁的「新增乘客」入口開頁，每次代表不同乘客；重新整理保留該頁身分。依序點選上車點與下車點、輸入人數後送出，或一鍵隨機送出一筆。等待派車可取消，規劃路線開始後拒絕取消。

Server 按送出順序掃描等待請求，選擇容量足夠、在線且空閒的最近車輛。暫不可服務的請求保留順位，後面可服務的請求仍可派車；超過車隊最大容量直接拒絕。規劃及執行期間每車僅一個任務。完成後停在下車點並從該處接下一筆。

限量生成器另開終端機：

```powershell
.\.venv\Scripts\python.exe -m clients.passenger
```

預設每 5～15 真實秒生成一筆、最多 20 筆，每筆使用新的乘客身分。與網頁單筆隨機共用 Server 規則：台北市範圍、1～車隊最大容量、最短距離 200 公尺、最多抽樣 20 次，失敗不送單。生成器以 `Ctrl+C` 停止，網頁沒有持續生成開關。

| 設定 | 生效方式 |
| --- | --- |
| `speed_multiplier` | 監控頁即時修改，不重置行駛進度 |
| `vehicles`、離線門檻 | 重啟 Server 與車隊 Client |
| 回報／更新間隔 | 監控頁保存後即時生效並寫入設定檔；重啟 Server 後保留 |
| 路線逾時、嘗試次數、併發上限 | 重啟 Server |
| `random_requests` 範圍、距離、抽樣上限 | 重啟 Server |
| `generator` 間隔與總數 | 重啟生成器；生成器直接讀取指定設定檔 |

只重啟生成器不清空 Server。重新開始整場模擬時，以 `Ctrl+C` 停止生成器、車隊 Client 與 Server，修改設定後依啟動順序重開三者。Server 使用記憶體，新輪清空所有請求／任務並回到各車初始位置；舊輪次回報不得更新新資料。

同輪失聯時，未載客車暫停接人，已載客車沿快取路線送達後等待；Server 保留原任務，不失敗或轉派。恢復後先核對原任務與進度，送達結果確認後才能接新單，上一筆重複完成不影響新任務。永久失聯保持待確認，由操作者重新開始整場模擬。網頁保留最後資料並標示中斷；生成器斷線暫停，恢復後繼續剩餘筆數且不補發。

| HTTP | 行為 |
| --- | --- |
| `POST /api/requests` | `{passenger_id, pickup, destination, passenger_count, client_request_id?}` 提出請求 |
| `POST /api/requests/random` | `{passenger_id, client_request_id?}` 共用規則生成並提出一筆 |
| `GET /api/requests?passenger_id=...` | 讀取指定乘客的請求 |
| `POST /api/requests/{id}/cancel` | `{passenger_id}` 取消等待請求 |
| `GET /api/vehicles/{id}/task` | 取得有效任務、輪次與設定 |
| `POST /api/vehicles/{id}/reports` | 位置、朝向及 `{run_id, task_id, phase, progress}` 核對進度／完成 |
| `PUT /api/simulation/speed` | `{speed_multiplier}` 修改速度 |
| `PUT /api/simulation/intervals` | `{report_interval_seconds, poll_interval_seconds}` 驗證並保存兩種間隔；只更新這兩項設定 |

速度拉桿為 1～300 整數，預設 60，不永久保存。車輛回報與網頁更新間隔各自保存至設定檔，車輛及網頁在下一次成功 HTTP 通訊後套用，不重置模擬。`client_request_id` 用於同輪不確定送單結果的重試，避免重複產生請求；同一乘客最多一筆進行中請求，乘客頁只顯示目前請求。此免登入識別僅供本機模擬。

所有地圖頁均可切換 POI 及調整模型比例。模型比例為 1～100、預設 30；POI 預設顯示。兩項偏好由瀏覽器依監控／乘客頁類型分別保存，不寫入 Server 設定。

## 自訂 UI

將 [UI 最小接入契約](docs/ui-interface.md) 交給 AI，實作 `ui-template.html`、`src/ui-template.css`、`src/ui-template.js`。三個檔案目前只有空白入口；透過 `src/ui-client.js` 訂閱資料、執行操作與掛載地圖，DOM 與視覺可自行設計。原版監控與乘客頁也使用同一個共用模組。

啟動 Vite 後從 `/ui-template.html` 預覽；現有 `/` 與 `/dispatch.html` 可用於比對功能。新 UI 實作完成後，人工確認監控選車／跟隨、乘客選點／送出／取消，以及斷線時保留資料並停用送出；不得在送出結果待確認時另建新請求。

## 道路路線整合驗收

1. 啟動 Server 與 Vite，開啟 [道路路線驗收](http://127.0.0.1:5173/?route-check)。這是整合用入口；一般監控頁隱藏此表單，也不會自動查詢路線。車輛 Client 可另行執行，查詢不依賴它。
2. 按「查詢官方路線」，核對地圖藍線、綠色圓形「起」、紅色方形「迄」，以及側欄的公尺、秒數、道路座標點數。畫面以俯視定位整條路線；瀏覽器直接使用 Server 已解碼的座標，不另查 SDK DirectionsService。
3. 預設起訖 `[121.561, 25.0334]` → `[121.517, 25.0478]` 已於 2026-10-13 實測成功：官方 `HTTP 200 / status OK`，15 個 steps 解碼合併為 105 點，6,064 公尺、999 秒。道路幾何起訖為 `[121.56098, 25.03307]` → `[121.51623, 25.04793]`；官方 leg 的起訖 metadata 為請求點，steps 才是道路投影點。因此標記放在請求點，藍線保留道路投影位置，不補直線。預估時間可能隨查詢時刻改變。
4. 更換一組起訖或對調方向再查詢，確認舊線與標記被清除、只顯示新結果。輸入錯誤座標後查詢，應顯示錯誤，且不保留前次成功線形或數值。
5. 暫時將 `ROUTES_API_KEY` 設為空白／無效值，重啟 Server 再查詢，應顯示缺少憑證／授權遭拒。實測無效 Key 的官方回應為 `HTTP 401 / REQUEST_DENIED`，Server 回應 503；憑證缺漏也回應 503。恢復憑證並重啟後可再查詢。勿將憑證或含 Key 的上游 URL 寫入文件。

`POST /api/routes` 回傳 `provider`、請求 `origin`／`destination`、完整 `coordinates`（均為 `[經度, 緯度]`）、`distance_meters` 與 `duration_seconds`。Server 將請求轉為官方 REST 的 `Origin`／`Destination`（`緯度,經度`），解碼每個 `steps[].polyline.points`（E5），核對 step 起訖與連續性，再加總 leg 的數值距離／時間；不用 overview 簡化線或文字推算。缺失／不連續道路資料回應 502，不產生替代路線；輸入無效回應 422，逾時回應 504，網路／上游異常回應 502，HTTP 授權或頻率拒絕回應 503。暫時性逾時、網路或上游錯誤依 route_max_attempts 重試，預設最多三次；每次 route_timeout_seconds 預設 10 秒，包含等待併發空位。無可行路線或重試耗盡會保留失敗原因並釋放保留車輛。同點路段以零距離／零時間直接完成，不造替代道路。

官方公開 [Starter 方案](https://kwmapdeveloper.localking.com.tw/products) 列出每日 100 次且須管理員核准；登入後才能查閱自己的訂閱。目前本機 Key 的實際方案、每日配額與頻率上限未取得證據，使用者表示目前可能不限次，因此不以公開 Starter 配額當成本機限制，也不宣稱已確認無限使用。已查核 [服務條款](https://kwmapdeveloper.localking.com.tw/maps-service-terms) 的座標暫存期限為 30 天；目前 Server 僅於本輪記憶體任務中保留道路路線，重啟即清空；長時間展示仍應在 30 天內重新開始。人工查核暫存限置於 Git 忽略的 `.local`，驗證後移除。

## 官方介面依據

- [mapThree 初始化](https://kw3dmap.localking.com.tw/3dmap/api/mapThree/info)
- [add3dModel](https://kw3dmap.localking.com.tw/3dmap/api/mapThree/methods#add3dmodel)：使用 `obj`、獨立模型 id 與三維座標。
- [setCoordinates／setRotation](https://kw3dmap.localking.com.tw/3dmap/api/mapThree/model)：依回報設定座標；旋轉相對模型建立基準。
- [Direction REST](https://kwmapdeveloper.localking.com.tw/api-details#api=places-api-prod&operation=get-maps-api-directions-output-key-key)：正式端點為 `GET https://kwmap.localking.com.tw/maps/api/Directions/json`，參數 `Key`、`Origin`、`Destination`、`Mode=driving`、`Language=zh-TW`。基本 Direction 限制最多 10 個 waypoints，指定出發時間等進階需求須使用 Direction Advance；此切片只查起訖兩點。
- [Encoded Polyline](https://developers.google.com/maps/documentation/utilities/polylinealgorithm)：E5 演算法與官方三點範例；已核對解碼結果及真實 REST steps。
- [add3dLine](https://kw3dmap.localking.com.tw/3dmap/api/mapThree/methods#add3dline)、[Marker](https://kw3dmap.localking.com.tw/3dmap/api/marker/info)、[fitBounds](https://kw3dmap.localking.com.tw/3dmap/api/map/methods#fitbounds)：顯示 Server 道路線形、不同起訖標記並定位。
- [Vite HTTP 代理](https://vite.dev/config/server-options#server-proxy)、[FastAPI workers](https://fastapi.tiangolo.com/deployment/server-workers/)。


