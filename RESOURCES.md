# 網頁與本機 Client / Server Resources

## Angular

- [Angular 官方：Components](https://angular.dev/essentials/components)
  說明元件如何組成 Angular 介面。用於理解本專案的 Workspace、監控及乘客元件。
- [Angular 官方：Dependency Injection](https://angular.dev/essentials/dependency-injection)
  說明 service 如何被元件注入及共用。用於追蹤 SimulationService 和 ApiService。
- [Angular 官方：Signals](https://angular.dev/guide/signals)
  說明 Signals 如何追蹤狀態的讀取者，以及 computed 如何依賴其他 Signals。用於理解本專案從 Server 快照更新到監控畫面的流程。
- [Angular 官方：Binding dynamic text, properties and attributes](https://angular.dev/guide/templates/binding)
  說明如何使用雙大括號把元件資料顯示在範本文字中。用於讀懂車隊摘要上的在線數字。
- [Angular 官方：Making HTTP requests](https://angular.dev/guide/http)
  說明 Angular HttpClient 的請求流程。用於對照本專案 ApiService 與 FastAPI 的 HTTP 連線。
- [Angular 官方：Serving applications for development](https://angular.dev/tools/cli/serve)
  說明 Angular CLI 開發伺服器與 proxy 設定。用於理解本專案 `npm run dev`。
- [Angular 官方：Building Angular apps](https://angular.dev/tools/cli/build)
  說明 Angular CLI 如何編譯、最佳化與打包應用程式。用於理解本專案 `npm run build`。

## Knowledge

- [Vite: Getting Started](https://vite.dev/guide/)
  舊版 Vanilla JavaScript 課程使用的開發伺服器參考；目前前端已遷移 Angular，`npm run dev` 由 Angular CLI 提供。
- [MDN: `<script>` 元素](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script)
  說明 HTML 如何載入 JavaScript。舊版入口課程使用此資料；目前 `index.html` 以 `<app-root>` 掛載 Angular 應用。
- [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
  說明 JavaScript 的 `import` / `export`。舊版課程沿著 Vanilla JavaScript 模組追程式；目前 Angular 入口為 `src/main.ts`。
- [MDN: `Crypto.randomUUID()`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)
  說明瀏覽器如何產生 v4 UUID。用於讀懂乘客端替每次新請求建立 `client_request_id` 的程式。
- [MDN: Getting started with CSS](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Getting_started)
  說明如何把 CSS 套用至 HTML，並用選擇器指定元素。用於閱讀 `src/style.css` 與調整 UI 外觀。
- [MDN: Making network requests with JavaScript](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Network_requests)
  說明瀏覽器如何用網路請求取得資料。用於理解前端和 Server 的 HTTP 交換。
- [FastAPI: Lifespan Events](https://fastapi.tiangolo.com/advanced/events/)
  說明 startup、yield 與 shutdown 如何管理應用程式共用資源。用於閱讀 `server/app.py` 的 lifespan。
- [FastAPI: First Steps（繁體中文）](https://fastapi.tiangolo.com/zh-hant/tutorial/first-steps/)
  說明 FastAPI 路徑裝飾器如何把 HTTP 請求交給其下方的函式。用於閱讀 `server/app.py`。
- [Python 官方教學：類別與方法](https://docs.python.org/3/tutorial/classes.html)
  說明物件、attribute 與 method 的關係。用於讀懂 Simulation 的 `self` 和 `snapshot()`。
- [Python 官方教學：定義函式](https://docs.python.org/3/tutorial/controlflow.html#defining-functions)
  說明 Python 函式的 `def`、參數與回傳概念。用於學習 Server 函式的基本語法。
- [Python 3.12: `contextlib.asynccontextmanager`](https://docs.python.org/3.12/library/contextlib.html#contextlib.asynccontextmanager)
  說明如何把 async generator 包成非同步 context manager，搭配 `yield` 控制建立與清理資源。
- [Python 3.12: Dictionary displays](https://docs.python.org/3.12/reference/expressions.html#dictionary-displays)
  說明字典中的 `**mapping` 如何展開鍵值，以及重複鍵由較後方的值覆蓋。
- [Python 3.12: Coroutines and Tasks](https://docs.python.org/3.12/library/asyncio-task.html#coroutines)
  說明呼叫 `async def` 函式會建立 coroutine，以及 `await` 如何執行並取得結果。用於讀懂 `app.py` 對 `Simulation.submit()` 的呼叫。
- [Python 3.12: asyncio Lock](https://docs.python.org/3.12/library/asyncio-sync.html#lock)
  說明 asyncio tasks 如何透過 `Lock` 獨佔存取共享資源，以及用 `async with` 自動取得和釋放鎖。用於閱讀 `Simulation` 的共享狀態更新。
- [FastAPI: Request Body](https://fastapi.tiangolo.com/tutorial/body/)
  說明以 Pydantic model 型別作為 API 參數時，FastAPI 如何解析與驗證 JSON request body。
- [FastAPI: Body Fields](https://fastapi.tiangolo.com/tutorial/body-fields/)
  說明如何用 Pydantic `Field` 加上欄位驗證條件與 metadata。
- [FastAPI: Concurrency and async / await](https://fastapi.tiangolo.com/async/)
  說明 FastAPI 路由與 async 函式如何配合。用於理解 API handler 如何等待非同步服務方法。

## Wisdom (Communities)

- 目前以本機程式、官方文件與和助理互動練習為主；尚未選擇外部社群。

## Gaps

- 課程尚未涵蓋瀏覽器開發者工具的實作練習；等讀到 HTTP 資料流時再補充最合適的官方文件。
