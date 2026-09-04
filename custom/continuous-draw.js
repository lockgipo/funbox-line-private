/* ===== Funbox 連續抽選模式：依商品開始時間自動判斷 ===== */
(function () {
    "use strict";

    var DRAWN_KEY = "funbox_continuous_draw_v9_drawn";
    var SKIPPED_STORES_KEY = "funbox_continuous_draw_skipped_stores";
    var PENDING_OPEN_KEY = "funbox_continuous_draw_pending_open";
    var LAST_COMPLETED_KEY = "funbox_continuous_draw_last_completed";
    var AUTO_CHAIN_KEY = "funbox_continuous_draw_auto_chain";
    // 將舊版「已變灰／已點過」的抽獎按鈕同步到快速抽選紀錄。
    // 同一個網址下，換 HTML 不會清掉 localStorage；這裡把舊紀錄補進新的 DRAWN_KEY。
    function migrateLegacyDrawnRecords() {
        var map = drawnMap();
        var changed = false;

        document.querySelectorAll("#page-draws .draw-item").forEach(function (itemEl) {
            var linkEl = itemEl.querySelector(".draw-link");
            if (!linkEl) return;

            var href = linkEl.href || "";
            if (!href) return;

            // 舊版按鈕已經是灰色，或保留了 clicked 狀態，就視為以前抽過。
            var computed = window.getComputedStyle(linkEl);
            var bg = (computed.backgroundColor || "").replace(/\s/g, "");
            var isLegacyGray =
                linkEl.classList.contains("clicked") ||
                linkEl.classList.contains("quick-drawn") ||
                bg === "rgb(160,160,160)" ||
                bg === "rgb(169,169,169)" ||
                bg === "rgb(217,217,217)";

            if (isLegacyGray && !map[href]) {
                map[href] = true;
                changed = true;
            }
        });

        if (changed) {
            writeJson(DRAWN_KEY, map);
        }

        return changed;
    }

    var stores = [];
    var currentCity = "all";
    var currentProduct = "all";
    var currentItem = null;
    var autoOpenTimer = null;
    var autoOpenScheduled = false;

    function $id(id) { return document.getElementById(id); }

    function collectStores() {
        var result = [];

        document.querySelectorAll("#page-draws .draw-store").forEach(function (storeEl) {
            var city = storeEl.getAttribute("data-draw-city") || "未分類";
            var nameEl = storeEl.querySelector(".draw-store-name");
            var name = nameEl ? nameEl.textContent.trim() : "";
            var products = [];

            storeEl.querySelectorAll(".draw-item").forEach(function (itemEl) {
                var productEl = itemEl.querySelector(".draw-product");
                var linkEl = itemEl.querySelector(".draw-link");
                if (!productEl || !linkEl || !linkEl.href) return;

                products.push({
                    product: productEl.textContent.trim(),
                    url: linkEl.href,
                    element: itemEl,
                    link: linkEl
                });
            });

            if (name && products.length) {
                result.push({
                    city: city,
                    name: name,
                    products: products,
                    element: storeEl
                });
            }
        });

        return result;
    }

    function readJson(key) {
        try { return JSON.parse(localStorage.getItem(key) || "{}"); }
        catch (e) { return {}; }
    }

    function writeJson(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    function clearStored(key) {
        try { localStorage.removeItem(key); } catch (e) {}
    }

    function drawnMap() {
        return readJson(DRAWN_KEY);
    }

    function skippedStoresMap() {
        return readJson(SKIPPED_STORES_KEY);
    }

    function isAutoChainEnabled() {
        try { return localStorage.getItem(AUTO_CHAIN_KEY) !== "false"; }
        catch (e) { return true; }
    }

    function setAutoChainEnabled(enabled) {
        try { localStorage.setItem(AUTO_CHAIN_KEY, enabled ? "true" : "false"); }
        catch (e) {}
    }

    function storeKey(store) {
        return store.city + "::" + store.name;
    }

    function isStoreSkipped(store) {
        return !!skippedStoresMap()[storeKey(store)];
    }

    function skippedStoreCount() {
        return Object.keys(skippedStoresMap()).length;
    }

    function markDrawn(product) {
        var map = drawnMap();
        map[product.url] = true;
        writeJson(DRAWN_KEY, map);

        if (product.link) {
            product.link.classList.add("clicked");
        }
        product.element.classList.add("quick-drawn");
    }

    function unmarkDrawn(url) {
        var map = drawnMap();
        delete map[url];
        writeJson(DRAWN_KEY, map);

        stores.forEach(function (store) {
            store.products.forEach(function (product) {
                if (product.url !== url) return;
                product.element.classList.remove("quick-drawn");
                product.link.classList.remove("clicked");
            });
        });
    }

    function findProductByUrl(url) {
        for (var s = 0; s < stores.length; s++) {
            for (var p = 0; p < stores[s].products.length; p++) {
                if (stores[s].products[p].url === url) {
                    return {
                        store: stores[s],
                        product: stores[s].products[p]
                    };
                }
            }
        }
        return null;
    }

    function rememberCompleted(item, method) {
        writeJson(LAST_COMPLETED_KEY, {
            url: item.product.url,
            product: item.product.product,
            store: item.store.name,
            method: method || "manual",
            completedAt: Date.now()
        });
    }

    function clearPendingForUrl(url) {
        var pending = readJson(PENDING_OPEN_KEY);
        if (!url || pending.url === url) {
            clearStored(PENDING_OPEN_KEY);
        }
    }

    function rememberPendingOpen(item) {
        writeJson(PENDING_OPEN_KEY, {
            url: item.product.url,
            product: item.product.product,
            store: item.store.name,
            openedAt: Date.now(),
            pageHidden: false
        });
    }

    function isDrawn(product) {
        if (!!drawnMap()[product.url]) return true;

        // 一般列表已經變灰或點過時，快速抽選也必須略過。
        if (product.link && product.link.classList.contains("clicked")) return true;
        if (product.element && product.element.classList.contains("quick-drawn")) return true;

        return false;
    }

    function syncDrawnRows() {
        var map = drawnMap();

        stores.forEach(function (store) {
            store.products.forEach(function (product) {
                if (map[product.url]) {
                    product.element.classList.add("quick-drawn");
                    product.link.classList.add("clicked");
                } else {
                    product.element.classList.remove("quick-drawn");
                    product.link.classList.remove("clicked");
                }
            });
        });
    }

    // 支援商品名稱內的：
    // （8/29 11:00才開始）
    // （8/29 11:00開始）
    // (8/29 11:00才開始)
    function getProductStartTime(productText) {
        var match = productText.match(
            /[（(]\s*(\d{1,2})\s*\/\s*(\d{1,2})\s+([01]?\d|2[0-3]):([0-5]\d)\s*(?:才)?開始\s*[）)]/
        );

        if (!match) return null;

        var now = new Date();
        var year = now.getFullYear();
        var month = parseInt(match[1], 10);
        var day = parseInt(match[2], 10);
        var hour = parseInt(match[3], 10);
        var minute = parseInt(match[4], 10);

        var start = new Date(year, month - 1, day, hour, minute, 0, 0);

        // 跨年情況：例如目前 12 月、文字寫 1/2。
        if (start.getTime() < now.getTime() && month < (now.getMonth() + 1) - 6) {
            start.setFullYear(year + 1);
        }

        return start;
    }

    function hasStarted(product) {
        var start = getProductStartTime(product.product);
        return !start || new Date() >= start;
    }

    // 讓一般抽獎列表中的指定時間商品即時切換。
    // 例如「（8/29 10:00才開始）」：
    // 10:00 前顯示灰色「尚未開始」，10:00 到後自動變成綠色「抽獎」。
    function syncTimedDrawLinks() {
        var now = new Date();

        document.querySelectorAll("#page-draws .draw-item").forEach(function (itemEl) {
            var productEl = itemEl.querySelector(".draw-product");
            var linkEl = itemEl.querySelector(".draw-link");
            if (!productEl || !linkEl) return;

            var start = getProductStartTime(productEl.textContent.trim());

            if (!start) {
                linkEl.classList.remove("not-started");
                if (linkEl.textContent.trim() === "尚未開始") {
                    linkEl.textContent = "抽獎";
                }
                return;
            }

            // 已抽的狀態不被時間同步覆蓋。
            if (itemEl.classList.contains("quick-drawn") ||
                linkEl.classList.contains("clicked")) {
                linkEl.classList.remove("not-started");
                return;
            }

            if (now >= start) {
                linkEl.classList.remove("not-started");
                linkEl.textContent = "抽獎";
                linkEl.removeAttribute("aria-disabled");
                linkEl.removeAttribute("tabindex");
                linkEl.title = "";
            } else {
                linkEl.classList.add("not-started");
                linkEl.textContent = "尚未開始";
                linkEl.setAttribute("aria-disabled", "true");
                linkEl.setAttribute("tabindex", "-1");
                linkEl.title =
                    "尚未到開始時間：" +
                    (start.getMonth() + 1) + "/" +
                    start.getDate() + " " +
                    String(start.getHours()).padStart(2, "0") + ":" +
                    String(start.getMinutes()).padStart(2, "0");
            }
        });
    }

    function startTimedDrawWatcher() {
        syncTimedDrawLinks();
        setInterval(function () {
            syncTimedDrawLinks();
            if (typeof render === "function") {
                render();
            }
        }, 1000);
    }


    function quickDrawModel(text) {
        var match = String(text || "").toUpperCase().match(/\b(BXG|BGX|BX|UX|CX)\s*-\s*(\d{2})\b/);
        if (!match) return "";
        var prefix = match[1] === "BGX" ? "BXG" : match[1];
        return prefix + "-" + match[2];
    }

    function quickDrawProductMatches(product) {
        if (currentProduct === "all") return true;
        return quickDrawModel(product.product) === currentProduct;
    }

    function filteredStores() {
        return stores.filter(function (store) {
            var inSelectedCity = currentCity === "all" || store.city === currentCity;
            if (!inSelectedCity || isStoreSkipped(store)) return false;

            if (currentProduct === "all") return true;
            return store.products.some(function (product) {
                return quickDrawProductMatches(product);
            });
        });
    }

    // 從目前縣市中，找「尚未抽 + 已經開始」的第一個商品。
    // 因為未開始的商品不會被寫進已抽紀錄，
    // 所以明天時間到了之後重新整理，就會自動重新出現在連續抽選流程中。
    function findNextItem() {
        var list = filteredStores();

        for (var s = 0; s < list.length; s++) {
            var store = list[s];

            for (var p = 0; p < store.products.length; p++) {
                var product = store.products[p];

                if (!quickDrawProductMatches(product)) continue;
                if (isDrawn(product)) continue;
                if (!hasStarted(product)) continue;

                return {
                    store: store,
                    product: product,
                    storeIndex: s,
                    productIndex: p
                };
            }
        }

        return null;
    }

    function renderReturnStatus() {
        var status = $id("continuousDrawStatus");
        var undo = $id("continuousDrawUndo");
        if (!status || !undo) return;

        var pending = readJson(PENDING_OPEN_KEY);
        var last = readJson(LAST_COMPLETED_KEY);

        status.classList.remove("show", "waiting");
        status.textContent = "";
        undo.disabled = true;

        if (autoOpenScheduled) {
            status.textContent = "已完成「" + (last.product || "上一個抽選") + "」，正在自動開啟下一個 LINE 抽選…";
            status.classList.add("show", "waiting");
            undo.disabled = !(last.url && drawnMap()[last.url]);
            return;
        }

        if (pending.url) {
            status.textContent = "已開啟「" + (pending.product || "目前項目") + "」。從 LINE 回到此頁後，會自動接力下一個。";
            status.classList.add("show", "waiting");
            return;
        }

        if (last.url && drawnMap()[last.url]) {
            status.textContent = "已記錄完成：「" + (last.product || "上一個抽選") + "」，下一個已準備好。";
            status.classList.add("show");
            undo.disabled = false;
        }
    }

    function render() {
        var progress = $id("continuousDrawProgress");
        var storeEl = $id("continuousDrawStore");
        var productEl = $id("continuousDrawProduct");
        var open = $id("continuousDrawOpen");
        var next = $id("continuousDrawNext");
        var skipStore = $id("continuousDrawSkipStore");
        var autoToggle = $id("continuousDrawAutoToggle");
        var undo = $id("continuousDrawUndo");
        var restore = $id("continuousDrawRestore");
        var stopOverlay = $id("continuousDrawStopOverlay");

        if (!progress || !storeEl || !productEl || !open || !next || !skipStore || !autoToggle || !undo || !restore || !stopOverlay) return;

        var list = filteredStores();
        var candidate = findNextItem();
        var skippedCount = skippedStoreCount();
        currentItem = candidate;
        restore.disabled = skippedCount === 0;
        restore.textContent = skippedCount ? "恢復已跳過店家（" + skippedCount + "）" : "恢復已跳過店家";
        autoToggle.textContent = isAutoChainEnabled()
            ? "⏸️ 暫停全自動接力"
            : "▶️ 開啟全自動接力";
        stopOverlay.classList.toggle("show", autoOpenScheduled);
        stopOverlay.setAttribute("aria-hidden", autoOpenScheduled ? "false" : "true");
        renderReturnStatus();

        if (!list.length) {
            progress.textContent = "目前沒有可用的抽選資料";
            storeEl.textContent = "";
            productEl.textContent = "";
            open.disabled = true;
            next.disabled = true;
            skipStore.disabled = true;
            return;
        }

        if (!candidate) {
            progress.textContent =
                "目前沒有已開始且尚未抽的抽選";
            storeEl.textContent = "";
            productEl.textContent = "之後開始的項目會在開始時間到達後自動加入";
            open.disabled = true;
            next.disabled = true;
            skipStore.disabled = true;
            return;
        }

        progress.textContent =
            "第 " + (candidate.storeIndex + 1) + " / " + list.length + " 家";

        var matchedProductCount = candidate.store.products.filter(function (product) {
            return quickDrawProductMatches(product);
        }).length;

        storeEl.textContent =
            candidate.store.name + "　（" +
            matchedProductCount + " 個符合篩選）";

        productEl.textContent = candidate.product.product;

        open.disabled = false;
        next.disabled = false;
        skipStore.disabled = false;
        open.setAttribute("data-url", candidate.product.url);

        var pending = readJson(PENDING_OPEN_KEY);
        var last = readJson(LAST_COMPLETED_KEY);
        open.textContent = pending.url === candidate.product.url
            ? "🔁 重新開啟這個抽選"
            : (last.url && drawnMap()[last.url] ? "🔗 開啟下一個" : "🔗 開啟抽選");
        next.textContent = pending.url === candidate.product.url
            ? "✅ 已完成，顯示下一個"
            : "✅ 手動標記完成";
    }

    function setCityFromTopFilter(region) {
        currentCity = region || "all";
        render();
    }

    function setProductFromTopFilter(product) {
        currentProduct = product || "all";
        render();
    }

    // 原作者的篩選程式可透過這兩個入口同步快速抽選的範圍。
    window.syncQuickDrawRegion = setCityFromTopFilter;
    window.syncQuickDrawProduct = setProductFromTopFilter;

    function openCurrent() {
        if (!currentItem || !currentItem.product) return;

        if (!hasStarted(currentItem.product)) {
            render();
            return;
        }

        rememberPendingOpen(currentItem);
        renderReturnStatus();
        window.open(currentItem.product.url, "_blank");
    }

    function completeAndOpenNext() {
        if (!currentItem || !currentItem.product) {
            render();
            return;
        }

        // 再判斷一次，避免網頁開著期間剛好跨過開始時間。
        if (!hasStarted(currentItem.product)) {
            render();
            return;
        }

        markDrawn(currentItem.product);
        rememberCompleted(currentItem, "manual");
        clearPendingForUrl(currentItem.product.url);
        syncDrawnRows();
        render();
        scheduleAutoOpenNext();
    }

    function cancelAutoOpenTimer() {
        if (autoOpenTimer !== null) {
            window.clearTimeout(autoOpenTimer);
            autoOpenTimer = null;
        }
        autoOpenScheduled = false;
    }

    function scheduleAutoOpenNext() {
        cancelAutoOpenTimer();
        if (!isAutoChainEnabled()) return;

        var nextItem = findNextItem();
        if (!nextItem || !nextItem.product) return;

        autoOpenScheduled = true;
        render();

        autoOpenTimer = window.setTimeout(function () {
            autoOpenTimer = null;
            autoOpenScheduled = false;

            var target = findNextItem();
            if (!target || !target.product) {
                render();
                return;
            }

            currentItem = target;
            rememberPendingOpen(target);
            render();

            // 自動事件中的新分頁通常會被 iPhone 阻擋，因此改用目前頁面導向。
            // LINE 的 Universal Link 若成功接手，回到 Safari 時本頁仍可繼續下一輪。
            window.location.assign(target.product.url);
        }, 700);
    }

    function stopAutoChain() {
        cancelAutoOpenTimer();
        setAutoChainEnabled(false);
        render();
    }

    function toggleAutoChain() {
        var nextEnabled = !isAutoChainEnabled();
        setAutoChainEnabled(nextEnabled);

        if (!nextEnabled) {
            cancelAutoOpenTimer();
        }
        render();
    }

    function markPendingPageHidden() {
        var pending = readJson(PENDING_OPEN_KEY);
        if (!pending.url) return;

        pending.pageHidden = true;
        pending.hiddenAt = Date.now();
        writeJson(PENDING_OPEN_KEY, pending);
    }

    function completePendingAfterReturn() {
        var pending = readJson(PENDING_OPEN_KEY);
        if (!pending.url || !pending.pageHidden) return;

        // 避免很久以前未完成的操作，在日後開啟頁面時被誤判。
        if (pending.openedAt && Date.now() - pending.openedAt > 12 * 60 * 60 * 1000) {
            clearStored(PENDING_OPEN_KEY);
            render();
            return;
        }

        var item = findProductByUrl(pending.url);
        clearStored(PENDING_OPEN_KEY);

        if (!item || !hasStarted(item.product)) {
            render();
            return;
        }

        markDrawn(item.product);
        rememberCompleted(item, "return");
        syncDrawnRows();
        render();

        var panel = $id("continuousDrawPanel");
        if (panel && typeof panel.scrollIntoView === "function") {
            panel.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        scheduleAutoOpenNext();
    }

    function undoLastCompleted() {
        var last = readJson(LAST_COMPLETED_KEY);
        if (!last.url || !drawnMap()[last.url]) return;

        cancelAutoOpenTimer();
        unmarkDrawn(last.url);
        clearStored(LAST_COMPLETED_KEY);
        syncDrawnRows();
        render();
    }

    function skipCurrentStore() {
        if (!currentItem || !currentItem.store) return;

        var map = skippedStoresMap();
        map[storeKey(currentItem.store)] = true;
        writeJson(SKIPPED_STORES_KEY, map);
        render();
    }

    function restoreSkippedStores() {
        if (!skippedStoreCount()) return;
        writeJson(SKIPPED_STORES_KEY, {});
        render();
    }

    function hookTopCityButtons() {
        var oldFilter = window.filterDrawRegion;

        window.filterDrawRegion = function (region, btnElement) {
            if (typeof oldFilter === "function") {
                oldFilter(region, btnElement);
            }
            setCityFromTopFilter(region);
        };
    }

    function hookTopProductFilter() {
        var oldProductFilter = window.filterDrawProduct;

        window.filterDrawProduct = function (product) {
            if (typeof oldProductFilter === "function") {
                oldProductFilter(product);
            }
            setProductFromTopFilter(product);
        };
    }

    function init() {
        stores = collectStores();
        currentCity = "all";
        currentProduct = "all";

        try {
            currentCity = localStorage.getItem("funbox_selected_draw_region") || "all";
            currentProduct = localStorage.getItem("funbox_selected_draw_product") || "all";
        } catch (e) {}

        migrateLegacyDrawnRecords();
        syncDrawnRows();

        // 以畫面上的實際選項為準，避免瀏覽器留下的舊值與按鈕不同步。
        var activeCityBtn = document.querySelector("#page-draws .draw-filter-btn-group .filter-btn.active");
        if (activeCityBtn) {
            var activeClick = activeCityBtn.getAttribute("onclick") || "";
            var activeMatch = activeClick.match(/filterDrawRegion\('([^']+)'/);
            if (activeMatch) currentCity = activeMatch[1];
        }

        var productSelect = document.getElementById("drawProductFilter");
        if (productSelect) currentProduct = productSelect.value || "all";

        render();
        hookTopCityButtons();
        hookTopProductFilter();

        $id("continuousDrawOpen").onclick = openCurrent;
        $id("continuousDrawNext").onclick = completeAndOpenNext;
        $id("continuousDrawSkipStore").onclick = skipCurrentStore;
        $id("continuousDrawAutoToggle").onclick = toggleAutoChain;
        $id("continuousDrawUndo").onclick = undoLastCompleted;
        $id("continuousDrawRestore").onclick = restoreSkippedStores;
        $id("continuousDrawStopOverlay").addEventListener("pointerdown", stopAutoChain);

        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                markPendingPageHidden();
            } else {
                window.setTimeout(completePendingAfterReturn, 250);
            }
        });
        window.addEventListener("pagehide", markPendingPageHidden);
        window.addEventListener("pageshow", function () {
            window.setTimeout(completePendingAfterReturn, 250);
        });
        window.addEventListener("focus", function () {
            window.setTimeout(completePendingAfterReturn, 250);
        });
        startTimedDrawWatcher();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
