Status: 完成

# AI UI 規格模板

## 目標

提供一個中性的 HTML/CSS 起始頁，讓 AI 能依 UI DOM 契約產生新外觀，並沿用既有監控與乘客行為。

## 工作項目

- [x] 新增 `ui-template.html`，提供必要 DOM 節點與掛載點。
- [x] 新增 `src/ui-template.js` 與 `src/ui-template.css`，保持資料互動共用並提供樣式編輯入口。
- [x] 將模板加入 Vite 多頁面建置輸入。
- [x] 更新規格文件並確認前端建置。

## Comments

- AI 改版時主要編輯 `ui-template.html` 與 `src/ui-template.css`；保留 `src/ui-template.js` 中的 `app.js` 載入。
- `/ui-template.html` 已在本機預覽載入，並確認能呈現 Server 回報的車隊與車輛資料。
