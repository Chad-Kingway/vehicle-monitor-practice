Status: 完成

# AI UI 規格模板

## 目標

提供一組空白 HTML/CSS/JS 起始檔，讓 AI 能依最小接入契約實作新介面。AI 完成前，模板不載入既有樣式與應用，因此不具監控或乘客功能。

## 工作項目

- [x] 新增 `ui-template.html`，只提供空白文件結構與 `#app` 掛載點。
- [x] 新增不載入既有應用或樣式的 `src/ui-template.js` 與 `src/ui-template.css` 空白實作入口。
- [x] 將模板加入 Vite 多頁面建置輸入。
- [x] 更新規格文件並確認前端建置。

## Comments

- AI 依 `docs/ui-interface.md` 實作 `ui-template.html`、`src/ui-template.css`、`src/ui-template.js`；完成前此頁預期為空白，不能操作。
- 原版 `index.html` 和可操作的 `dispatch.html` 維持獨立，不會被空白模板覆蓋。
