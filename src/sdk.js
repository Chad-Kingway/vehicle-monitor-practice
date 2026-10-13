export function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

export function loadMapThree() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://kw3dmap.localking.com.tw/openapi/loader/mapThree-1.4.3.loader.js";
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "origin";
    let poll;
    const finish = (error, constructor) => {
      clearTimeout(timeout);
      clearInterval(poll);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve(constructor);
    };
    const timeout = setTimeout(() => finish(new Error("勤崴 SDK 載入逾時，請檢查網路後重新整理。")), 30000);
    script.onerror = () => finish(new Error("勤崴 SDK 載入失敗，請檢查網路後重新整理。"));
    script.onload = () => {
      // 官方 loader 以全域詞法綁定提供 mapThree，未必是 window 屬性。
      const check = () => {
        if (typeof mapThree === "function") finish(null, mapThree);
      };
      poll = setInterval(check, 100);
      check();
    };
    document.head.append(script);
  });
}
