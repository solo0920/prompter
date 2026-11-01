# Prompter

以區塊為單位的 Markdown 提示詞編輯器。直接在瀏覽器開啟 `index.html` 就能使用，不需要安裝、建置或後端伺服器；文件、圖片與偏好設定都留在本機。

- 線上版：<https://prompter.ragdemo.win/>
- 範例文件：[example.md](example.md)
- 授權：[MIT](LICENSE)

## 特色

| 功能 | 說明 |
| --- | --- |
| 區塊式編輯 | 每個標題、段落、清單、引用都是獨立區塊，可拖曳排序、多選、複製、刪除與收合。 |
| Marker 支援 | 支援 `#`、`##`、`###`、`-`、`1.`、`>`、`.`，可從選單選擇或直接輸入偵測。 |
| 層級聚焦 | 一鍵只顯示某一種 Marker，其餘區塊變暗鎖定；即使文件尚無該層級也能選取，輸入框會自動使用該層 Marker，`+` 可直接新增同類項目。 |
| 多行輸入 | 在輸入框貼上多行 Markdown 會自動拆成多個區塊，並保留清單、引用與程式碼區塊。 |
| 即時預覽 | 即時渲染 Markdown、表格、程式碼與 KaTeX 數學公式，支援桌面分割視窗、全編輯區全寬預覽與行動版全頁預覽。 |
| 複製輸出 | 一鍵複製完整 Markdown，或同時提供 Rich HTML（含圖片與 MathML）。 |
| 檔案操作 | 開啟 Markdown 與相關圖片、插入或貼上圖片、Save／Save As；支援 File System Access API，並在不可用時退回下載。 |
| 本機文件庫 | 使用 IndexedDB 儲存，必要時退回 localStorage 或單次工作階段記憶體；首頁列出最近 10 份文件。 |
| 多文件頁籤 | 同時開啟多份文件，切換、關閉與未儲存變更提示皆保留。 |
| 外觀 | 10 種樣式、淺色／深色／跟隨系統主題。 |
| 離線優先 | 所有資產皆隨專案提供，不載入 CDN、不發出執行期網路請求，可直接以 `file://` 使用。 |

## 快速開始

1. 下載或 clone 此專案。
2. 用瀏覽器開啟 `index.html`。
3. 從開始畫面選擇「新增文件」、「開啟目錄」、「開啟檔案」，或點擊範例文件 `example.md`。

不需要執行 `npm install`，也不需要建置。建議使用最新版 Chrome 或 Edge；Firefox 亦可使用，儲存時會視瀏覽器能力改用下載流程。

如果想用本機靜態伺服器開啟：

```bash
python3 -m http.server 8000
```

再開啟 <http://localhost:8000/>。應用本身不依賴伺服器，這只是另一種開啟方式。

## 操作概覽

- **新增內容**：點擊區塊右下角的 `+`，或使用畫面中的輸入框。`Enter` 建立、`Shift+Enter` 換行、`Escape` 取消。
- **編輯區塊**：`Enter` 或 `F2` 進入編輯；方向鍵切換區塊；`Cmd+Z`／`Ctrl+Z` 復原。
- **選取與拖曳**：`Cmd`／`Ctrl` 點擊可多選；拖曳任一選取區塊會整組移動。
- **層級聚焦**：點擊左側「依標題層級聚焦」，選擇 Marker。文件沒有該層級時仍可直接選取，輸入框會套用該 Marker 並取得焦點；輸入框聚焦時選擇層級會直接套用到草稿、保留游標並讓該層級保持選取，不會跳去編輯區塊；`↑`／`↓` 會在同層區塊與輸入框之間移動，輸入框與 `+` 都會沿用該 Marker。
- **複製**：使用上方 Copy 按鈕取得完整 Markdown；需要時可同時複製 Rich HTML。
- **儲存**：File → Save／Save As。第一次儲存可選擇資料夾；瀏覽器不支援直接寫入時會下載檔案與圖片。

## 專案結構

```text
.
├── index.html                 # 單一入口頁，依序載入 classic scripts
├── example.md                 # 可下載的 Markdown 範例
├── assets/
│   ├── css/
│   │   ├── base.css           # 重設與基礎樣式
│   │   ├── themes.css         # 10 種樣式與明暗主題
│   │   └── app.css            # 編輯器、區塊、對話框與響應式版面
│   ├── js/
│   │   ├── model.js           # 文件、區塊、偏好設定與驗證
│   │   ├── markdown.js        # 解析、序列化、Marker 偵測與閱讀順序
│   │   ├── editor.js          # 區塊編輯、拖曳、層級聚焦與輸入框
│   │   ├── files.js           # 開檔、存檔、圖片與下載流程
│   │   ├── storage.js         # IndexedDB／localStorage／記憶體儲存
│   │   ├── preview.js         # Markdown 與 KaTeX 預覽
│   │   ├── clipboard.js       # Markdown／Rich HTML 複製
│   │   ├── search.js          # 文件搜尋
│   │   ├── settings.js        # 設定、主題與樣式
│   │   ├── example.js         # example.md 的離線內嵌副本
│   │   └── app.js             # 啟動、頁籤與整體流程
│   ├── images/                # Favicon 與 App 圖示
│   └── vendor/katex/          # 隨專案提供的 KaTeX
├── tests/
│   ├── unit/                  # Node.js 單元與契約測試
│   ├── browser/               # 瀏覽器整合測試 harness
│   └── fixtures/              # Markdown 來回轉換測試檔案
├── specs/                     # 功能規格、計畫與 UI 契約
└── LICENSE
```

## 測試

### 單元與契約測試

需要 Node.js 18 以上版本，無需安裝套件：

```bash
node --test tests/unit/*.test.js
```

目前結果：**108 passing, 0 failing**。

### 瀏覽器整合測試

瀏覽器測試會在同源 iframe 中載入真正的 `index.html`，涵蓋編輯、拖曳、層級聚焦、儲存、預覽、複製、設定與響應式版面。建議透過本機靜態伺服器執行：

```bash
python3 -m http.server 8000
```

開啟 <http://localhost:8000/tests/browser/harness.html>，等待頁面顯示 `PASS`。

目前結果：**Chrome 117/117 passing**（線上與離線）。Firefox 與 Edge 為輔助驗證，最近一次完整結果為 112/112；Safari 測試目前暫停。

## 開發注意事項

- **不要引入建置流程**：專案刻意使用 classic scripts 與 `file://` 相容寫法，沒有 bundler、npm 依賴或執行期伺服器。
- **不要載入遠端資源**：樣式、字型、KaTeX 與圖片都必須是專案內資產，確保離線可用。
- **更新資產版本**：修改 `assets/` 下的 CSS 或 JS 後，請同步調整 `index.html` 中的 `?v=YYYYMMDD-NN` 查詢字串，避免 `file://` 重新整理時讀到舊快取。
- **同步範例文件**：修改 `example.md` 後，必須同步更新 `assets/js/example.js`；`tests/unit/example.test.js` 會比對兩者內容。
- **資料格式**：文件、圖片與偏好設定的 schema 版本與驗證規則集中在 `assets/js/model.js` 與 `assets/js/storage.js`。

## 部署

推送至 `main` 分支會由 Cloudflare 自動部署至：

<https://prompter.ragdemo.win/>

部署為純靜態網站，不需要伺服器端執行環境。

## 瀏覽器支援

- **Chrome／Edge**：主要支援目標，完整瀏覽器測試通過，支援直接寫入資料夾。
- **Firefox**：可使用，完整測試曾通過；存檔時可能改用下載流程。
- **Safari**：目前不列入例行測試；歷史版本曾通過 HTTP harness 與 `file://` 啟動檢查。

## 隱私

Prompter 不會上傳文件或圖片。所有內容都存在目前瀏覽器的本機儲存空間；清除瀏覽器資料或使用設定中的「Clear local library」會移除本機文件。已寫入磁碟的檔案不受影響。

## 授權

[MIT License](LICENSE) © 2026 Solomon Lee

第三方元件：[KaTeX](https://katex.org/)（MIT），授權文件位於 `assets/vendor/katex/LICENSE`。
