# Funbox 抽選頁面維護說明

目前正式使用的 `index.html` 保持不變。這套準備工具的目的，是在原作者更新抽獎活動或店家連結時，先做一份可以檢查的新版預覽，不會直接改掉已上線網站。

原作者來源：<https://github.com/UXUX11/funbox-line>

## 已模組化的功能

- `custom/continuous-draw-ui.html`：控制按鈕、說明文字與全螢幕停止區
- `custom/continuous-draw.css`：自訂外觀
- `custom/continuous-draw.js`：跳過店家、復原、全自動接力、0.7 秒停止區等行為
- `tools/sync-upstream.mjs`：下載原作者最新版、驗證結構、注入上述模組並產生預覽
- `tools/upstream-baseline.json`：記住已人工確認過的原作者抽選邏輯版本

因此未來抽獎連結更新時，通常不必重新複製這些功能，只要把自訂模組套到原作者的新 `index.html`。

## 安全更新流程

1. 執行預覽模式：

   ```text
   node tools/sync-upstream.mjs
   ```

2. 工具會先檢查原作者的重要頁面結構及所有頁面程式，確認沒有未審查的變更；抽獎網址也必須是 `lin.ee`，且處理前後的連結數量與順序完全相同。
3. 通過後只會產生 `preview/index.html`、`preview/custom/continuous-draw.css` 與 `preview/custom/continuous-draw.js`，不會碰正式的 `index.html`。
4. 先在手機或電腦測試預覽：縣市篩選、開啟 LINE、返回後自動接力、全螢幕停止、跳過店家與復原。
5. 確認預覽正常後，才執行正式套用：

   ```text
   node tools/sync-upstream.mjs --apply
   ```

6. 再檢查變更並提交到 GitHub。GitHub Pages 只有在這一步之後才會更新。

如果原作者改了頁面結構或抽選程式，工具會直接報錯並停止，不會產生或覆寫正式檔案。此時保留目前線上版，先比較對方的新邏輯、視需要更新自訂模組，確認後再更新 `tools/upstream-baseline.json`。

## GitHub 自動同步

`.github/workflows/check-upstream.yml` 會在每小時第 17 分自動檢查原作者。通過結構、程式版本及抽獎連結順序檢查後，只有內容確實改變時才提交新版 `index.html`；GitHub Pages 隨後會自動發布。也可以從 GitHub Actions 手動啟動。

如果原作者修改了尚未審查的連續抽選程式或重要頁面結構，流程會失敗並保留目前正式版，不會提交或發布不相容內容。

## 記錄如何延續

- 已抽過品項以抽獎網址記錄。原作者加入新網址時，新品項會自然出現在待抽清單。
- 如果同一活動只是把網址換掉，系統會把它視為新的品項；正式更新前應在預覽裡確認。
- 跳過店家以縣市與店名記錄。只要原作者沒有改店名，更新後仍會維持跳過。
- 所有記錄都存在該手機瀏覽器的本機儲存空間；清除 LINE 或 Safari 的網站資料會讓記錄消失。

## 同步工具依賴的原作者結構

工具會檢查抽獎頁、說明區、縣市篩選器、連續抽選控制區、店家清單與原始連續抽選程式的標記，也會確認 `.draw-store`、`.draw-item`、`.draw-link` 資料仍然存在。這些條件任何一項改變時，更新都會安全停止，避免把壞掉的版本推上線。
