/*
 * DELTARUNE WebPort - Chapter Save Importer
 *
 * Add this file to the same GitHub repository as index.html.
 * Then add this immediately BEFORE </body> in index.html:
 *
 *   <script src="save-importer.js"></script>
 *
 * The importer uses the chapter currently selected by the webport's ?c=N
 * URL. For example:
 *   ?c=1 -> filech1_0
 *   ?c=2 -> filech2_0
 *   ?c=3 -> filech3_0
 *   ?c=4 -> filech4_0
 *   ?c=5 -> filech5_0
 *
 * If a selected file is already named filechN_SLOT, its SLOT is preserved,
 * but N is replaced with the currently selected chapter. This means you can
 * import a save into the chapter you are currently playing without renaming it.
 */
(function () {
    "use strict";

    const DB_NAME = "/_savedata";
    const STORE_NAME = "FILE_DATA";
    const DB_VERSION = 21;

    function currentChapter() {
        const c = new URLSearchParams(window.location.search).get("c");
        const n = Number(c);
        return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
    }

    function cleanName(name) {
        return String(name || "")
            .replace(/^.*[\\/]/, "")
            .replace(/^_savedata[\\/]/i, "")
            .replace(/^\/_savedata[\\/]/i, "");
    }

    function getSlot(name) {
        const match = cleanName(name).match(/^filech[1-5]_(\d+)$/i);
        return match ? Number(match[1]) : null;
    }

    function showMessage(text) {
        if (typeof window.DeltaruneSaveManager?.showMessageBox === "function") {
            window.DeltaruneSaveManager.showMessageBox(text);
        } else {
            alert(text);
        }
    }

    function openDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error("IndexedDB is not supported by this browser."));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error || new Error("Could not open save database."));
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.close();
                    reject(new Error("The save database has not been initialized yet. Open the game once, then try again."));
                    return;
                }
                resolve(db);
            };
        });
    }

    function writeSave(db, key, contents) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.put({
                timestamp: new Date(),
                mode: 33206,
                contents: contents
            }, key);

            request.onerror = () => reject(request.error || new Error("Could not save " + key));
            request.onsuccess = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("Save transaction failed."));
        });
    }

    async function importToCurrentChapter() {
        const input = document.getElementById("uploadFileInput");
        if (!input || !input.files || input.files.length === 0) {
            showMessage("Please select a DELTARUNE save file first.");
            return;
        }

        const chapter = currentChapter();
        const db = await openDB();
        const imported = [];
        const skipped = [];

        try {
            for (const file of input.files) {
                const originalName = cleanName(file.name);
                let slot = getSlot(originalName);

                // A normal save is filechN_SLOT. If the name isn't in that
                // format, put it into slot 0 of the current chapter.
                if (slot === null) slot = 0;

                const data = new Uint8Array(await file.arrayBuffer());
                if (data.length === 0) {
                    skipped.push(originalName + " (empty file)");
                    continue;
                }

                const saveName = `filech${chapter}_${slot}`;
                const key = `/_savedata/${saveName}`;

                await writeSave(db, key, data);
                imported.push(`${saveName} (Chapter ${chapter}, slot ${slot})`);
            }
        } finally {
            db.close();
        }

        input.value = "";
        const filenameBox = document.getElementById("uploadFileNameInput");
        if (filenameBox) filenameBox.value = "";

        let result = `Imported ${imported.length} save${imported.length === 1 ? "" : "s"} into Chapter ${chapter}.`;
        if (imported.length) result += "\n\n" + imported.join("\n");
        if (skipped.length) result += "\n\nSkipped:\n" + skipped.join("\n");
        result += "\n\nReloading the webport...";

        showMessage(result, () => window.location.reload());
    }

    function install() {
        if (!window.DeltaruneSaveManager) return false;

        // Replace the existing uploader with the chapter-aware version.
        window.DeltaruneSaveManager.handleUpload = importToCurrentChapter;
        window.importDeltaruneSave = importToCurrentChapter;

        const button = document.querySelector('.file-upload-section button[onclick*="handleUpload"]');
        if (button) {
            button.textContent = "Import Save to Current Chapter!";
            button.onclick = importToCurrentChapter;
        }

        const filenameBox = document.getElementById("uploadFileNameInput");
        if (filenameBox) {
            filenameBox.style.display = "none";
            filenameBox.disabled = true;
        }

        return true;
    }

    // The save manager is declared before this file when the recommended
    // script tag is placed before </body>, but retrying also makes it robust.
    if (!install()) {
        let tries = 0;
        const timer = setInterval(() => {
            if (install() || ++tries >= 100) clearInterval(timer);
        }, 50);
    }
})();
