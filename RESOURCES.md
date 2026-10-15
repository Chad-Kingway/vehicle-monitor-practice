# 網頁與本機 Client / Server Resources

## Knowledge

- [Vite: Getting Started](https://vite.dev/guide/)
  說明 Vite 開發伺服器與 `index.html` 入口。用於追蹤這個專案如何由 `npm run dev` 提供網頁。
- [MDN: `<script>` 元素](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script)
  說明 HTML 如何載入 JavaScript，以及 module script 的基本行為。用於讀懂 `index.html` 的 `<script type="module">`。
- [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
  說明 `import` / `export` 如何拆分程式。用於沿著 `src/main.js` 找到前端功能模組。
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
