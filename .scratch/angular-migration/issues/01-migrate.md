Status: awaiting-validation

# 遷移 Angular 前端並完成驗收

依 ../spec.md 完成工具鏈、元件、服務、地圖生命週期與相容入口，更新專案文件並提交。

## Comments

- 2026-10-15：開始實作；沿用既有人工驗收，不新增測試檔。

- 2026-10-15：Angular 遷移已實作且 production build 通過；使用者要求小階段收尾後換模型，剩餘驗收見 docs/manual-acceptance.md。接手時先讀 spec.md、ADR 0003 及該驗收章節。
- 2026-10-15：補驗設定保存／還原、random 刷新冪等、dev／preview 舊入口、地圖選點與兩筆真實接送；調速不中斷行程，終止乘客頁保留原行程。開發地圖通過；production preview 地圖仍停在載入中，窄螢幕及 Angular 工作區實際卸載／重建尚未驗收，詳見 docs/manual-acceptance.md。
