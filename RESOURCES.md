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
- [FastAPI: First Steps（繁體中文）](https://fastapi.tiangolo.com/zh-hant/tutorial/first-steps/)
  說明 FastAPI 路徑裝飾器如何把 HTTP 請求交給其下方的函式。用於閱讀 `server/app.py`。
- [Python 官方教學：類別與方法](https://docs.python.org/3/tutorial/classes.html)
  說明物件、attribute 與 method 的關係。用於讀懂 Simulation 的 `self` 和 `snapshot()`。
- [Python 官方教學：定義函式](https://docs.python.org/3/tutorial/controlflow.html#defining-functions)
  說明 Python 函式的 `def`、參數與回傳概念。用於學習 Server 函式的基本語法。

## Wisdom (Communities)

- 目前以本機程式、官方文件與和助理互動練習為主；尚未選擇外部社群。

## Gaps

- 課程尚未涵蓋瀏覽器開發者工具的實作練習；等讀到 HTTP 資料流時再補充最合適的官方文件。
