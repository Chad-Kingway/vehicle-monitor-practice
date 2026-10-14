# 能讀出 FastAPI 路由呼叫哪個函式

使用者正確從 GET `/api/simulation` 的 route decorator 對應到 `get_simulation` 函式。已能把 URL 和 HTTP 方法連回 `app.py` 的處理函式；接下來可沿著函式的 return 追資料來源與回傳格式。
