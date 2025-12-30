// --- 1. CONFIGURATION & HELPERS ---

const OZU_SELECTORS = {
    header: ['.page-header-headings', '.page-header h1', 'h1'], 
    sections: ['ul.weeks li.section', 'ul.topics li.section', 'li[id^="section-"]'],
    sectionTitle: ['.sectionname', '[aria-label]'],
    resources: ['.activity.resource a', '.modtype_resource a'], 
    folders: ['.activity.folder a', '.modtype_folder a'],       
    pages: ['.activity.url a', '.activity.page a']              
};

function findElement(selectorList, parent = document) {
    for (let sel of selectorList) {
        const el = parent.querySelector(sel);
        if (el) return el;
    }
    return null;
}

function findAllElements(selectorList, parent = document) {
    for (let sel of selectorList) {
        const els = parent.querySelectorAll(sel);
        if (els.length > 0) return els;
    }
    return [];
}

// 🛡️ ABSOLUTE FIX: Blob to Base64 String
// Strings are primitives and cannot be "XrayWrapped" by Firefox.
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result
                .replace("data:", "")
                .replace(/^.+,/, "");
            resolve(base64String);
        };
        reader.onerror = () => reject(new Error("Failed to convert blob to base64"));
        reader.readAsDataURL(blob);
    });
}

// --- 2. INJECT BUTTONS ---

function addDownloadButton() {
    const header = findElement(OZU_SELECTORS.header);
    if (header && !document.getElementById('ozu-dl-btn')) {
        const div = document.createElement('div');
        div.id = 'ozu-dl-btn';
        div.style.display = "flex";
        div.style.gap = "10px";
        div.style.marginTop = "10px";

        const dlBtn = document.createElement('button');
        dlBtn.innerText = "📥 Download Materials";
        dlBtn.className = "btn btn-primary";
        dlBtn.style.backgroundColor = "#d6001c"; 
        dlBtn.style.borderColor = "#b00017";
        dlBtn.onclick = startDownloadProcess;

        const gradeBtn = document.createElement('button');
        gradeBtn.innerText = "📊 Export Grades";
        gradeBtn.className = "btn btn-secondary"; 
        gradeBtn.onclick = exportGrades;

        div.appendChild(dlBtn);
        div.appendChild(gradeBtn);
        header.appendChild(div);
    }
}

// --- 3. UTILITY FUNCTIONS ---

function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9áéíóúñü \.\-_]/gim, "").trim();
}

function getUniqueName(name, usedSet) {
    let finalName = name;
    let counter = 1;
    let baseName = name;
    let extension = "";
    if (name.includes('.')) {
        const parts = name.split('.');
        extension = "." + parts.pop();
        baseName = parts.join('.');
    }
    while (usedSet.has(finalName)) {
        finalName = `${baseName} (${counter})${extension}`;
        counter++;
    }
    usedSet.add(finalName);
    return finalName;
}

function detectTypeFromDOM(linkElement) {
    const icon = linkElement.querySelector('img.icon');
    let src = icon ? icon.src.toLowerCase() : "";
    const href = linkElement.href.toLowerCase();
    
    if (href.includes('/mod/folder/')) return 'FOLDER';

    if (href.endsWith('.pdf')) return 'PDF';
    if (href.match(/\.(ppt|pptx)$/)) return 'PPT';
    if (href.match(/\.(doc|docx)$/)) return 'DOC';
    if (href.match(/\.(xls|xlsx|csv)$/)) return 'XLS';
    if (href.match(/\.(zip|rar|7z|tar|gz)$/)) return 'ZIP';
    if (href.match(/\.(jpg|jpeg|png|gif|svg)$/)) return 'IMG';
    if (href.match(/\.(py|java|c|cpp|h|cs|js|html|css|php|sql)$/)) return 'CODE';
    if (href.match(/\.(mp4|mov|avi|mp3|wav)$/)) return 'MEDIA';

    if (src.includes('pdf')) return 'PDF';
    if (src.includes('powerpoint')) return 'PPT';
    if (src.includes('word')) return 'DOC';
    if (src.includes('spreadsheet') || src.includes('excel')) return 'XLS';
    if (src.includes('archive') || src.includes('zip')) return 'ZIP';
    if (src.includes('folder')) return 'FOLDER';
    
    return 'OTHER';
}

// --- 4. MODAL LOGIC ---

function promptUserForSections(sectionsMap) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex',
            justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(3px)'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: 'white', padding: '0', borderRadius: '12px',
            width: '650px', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontFamily: 'Segoe UI, sans-serif', overflow: 'hidden'
        });

        const header = document.createElement('div');
        Object.assign(header.style, { padding: '20px', borderBottom: '1px solid #eee' });
        header.innerHTML = `<h3 style="margin:0; color:#d6001c;">Download Manager</h3><p style="margin:5px 0 0; color:#666; font-size:0.9em;">Select materials to archive.</p>`;
        modal.appendChild(header);

        const content = document.createElement('div');
        Object.assign(content.style, { display: 'flex', flexGrow: 1, overflow: 'hidden' });
        
        const leftPanel = document.createElement('div');
        Object.assign(leftPanel.style, { width: '55%', borderRight: '1px solid #eee', overflowY: 'auto', padding: '15px' });
        leftPanel.innerHTML = `<div style="font-weight:bold; margin-bottom:10px; color:#2c3e50;">📅 Weeks / Topics</div>`;
        const weekCheckboxes = [];
        sectionsMap.forEach((sec, index) => {
            const label = document.createElement('label');
            Object.assign(label.style, { display: 'flex', alignItems: 'center', padding: '6px 0', cursor: 'pointer', fontSize:'0.95em' });
            const chk = document.createElement('input');
            chk.type = "checkbox"; chk.checked = true; chk.style.marginRight = "10px"; chk.dataset.index = index;
            label.append(chk, sec.name);
            leftPanel.appendChild(label);
            weekCheckboxes.push(chk);
        });

        const rightPanel = document.createElement('div');
        Object.assign(rightPanel.style, { width: '45%', padding: '15px', backgroundColor: '#f9f9f9' });
        rightPanel.innerHTML = `<div style="font-weight:bold; margin-bottom:10px; color:#2c3e50;">📂 File Types</div>`;
        
        const typeCheckboxes = {};
        const types = ['FOLDER', 'PDF', 'PPT', 'DOC', 'XLS', 'ZIP', 'CODE', 'IMG', 'MEDIA', 'OTHER'];
        const typeLabels = { 'FOLDER': '📁 Sub-Folders', 'PDF': '📄 PDF Documents', 'PPT': '📊 PowerPoint', 'DOC': '📝 Word Docs', 'XLS': '📈 Excel / CSV', 'ZIP': '📦 Archives', 'CODE': '💻 Code', 'IMG': '🖼️ Images', 'MEDIA': '🎥 Media', 'OTHER': '📁 Other' };

        types.forEach(type => {
            const label = document.createElement('label');
            Object.assign(label.style, { display: 'flex', alignItems: 'center', padding: '6px 0', cursor: 'pointer', fontSize:'0.9em' });
            const chk = document.createElement('input');
            chk.type = "checkbox"; chk.checked = true; chk.style.marginRight = "10px"; chk.dataset.type = type;
            label.append(chk, typeLabels[type] || type);
            rightPanel.appendChild(label);
            typeCheckboxes[type] = chk;
        });

        content.append(leftPanel, rightPanel);
        modal.appendChild(content);

        const footer = document.createElement('div');
        Object.assign(footer.style, { padding: '15px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', background: 'white' });
        
        const leftBtns = document.createElement('div');
        const allBtn = document.createElement('button'); allBtn.innerText="All"; allBtn.className="btn btn-sm btn-light"; allBtn.onclick=()=>weekCheckboxes.forEach(c=>c.checked=true);
        const noneBtn = document.createElement('button'); noneBtn.innerText="None"; noneBtn.className="btn btn-sm btn-light"; noneBtn.style.marginLeft="5px"; noneBtn.onclick=()=>weekCheckboxes.forEach(c=>c.checked=false);
        leftBtns.append(allBtn, noneBtn);

        const rightBtns = document.createElement('div');
        const cancel = document.createElement('button'); cancel.innerText="Cancel"; cancel.className="btn btn-secondary"; cancel.style.marginRight="10px"; 
        cancel.onclick=()=>{document.body.removeChild(overlay);resolve(null);};
        
        const confirm = document.createElement('button'); confirm.innerText="Start Download"; confirm.className="btn btn-primary"; confirm.style.backgroundColor="#d6001c"; 
        confirm.onclick=()=>{
            const selectedIdx = weekCheckboxes.filter(c=>c.checked).map(c=>parseInt(c.dataset.index));
            const allowedTypes = Object.keys(typeCheckboxes).filter(t=>typeCheckboxes[t].checked);
            document.body.removeChild(overlay);
            resolve({ indices: selectedIdx, types: allowedTypes });
        };
        
        rightBtns.append(cancel, confirm);
        footer.append(leftBtns, rightBtns);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}

// --- 5. MAIN DOWNLOAD LOGIC (BASE64 PRIMITIVE STRATEGY) ---

async function startDownloadProcess() {
    const btn = this;
    const originalText = btn.innerText;
    
    try {
        const sectionsList = findAllElements(OZU_SELECTORS.sections);
        if (!sectionsList || sectionsList.length === 0) { alert("No sections found on this page."); return; }

        const sectionsMap = Array.from(sectionsList).map(section => {
            let name = findElement(OZU_SELECTORS.sectionTitle, section)?.innerText || section.id || "Unknown Section";
            return { element: section, name: sanitizeFilename(name) };
        });

        const userSelection = await promptUserForSections(sectionsMap);
        if (!userSelection || userSelection.indices.length === 0) return;

        const { indices: selectedIndices, types: allowedTypes } = userSelection;

        btn.innerText = "⏳ Scanning...";
        btn.disabled = true;

        const zip = new JSZip();
        const courseStructure = [];
        const downloadQueue = [];
        const errorLog = []; 
        let totalItemsFound = 0;

        selectedIndices.forEach(index => {
            const sectionData = sectionsMap[index];
            const section = sectionData.element;
            const sectionName = sectionData.name;
            const folder = zip.folder(sectionName);
            const usedFilenames = new Set();
            const structEntry = { title: sectionName, files: [], links: [] };

            const allLinks = [
                ...findAllElements(OZU_SELECTORS.resources, section),
                ...findAllElements(OZU_SELECTORS.folders, section)
            ];

            allLinks.forEach((link) => {
                const detectedType = detectTypeFromDOM(link);
                if (!allowedTypes.includes(detectedType)) return;

                const url = link.href;
                let name = link.querySelector('.instancename')?.childNodes[0].textContent || link.innerText;
                name = sanitizeFilename(name);
                name = getUniqueName(name, usedFilenames);

                if (url && name) {
                    if (detectedType === 'FOLDER') {
                        const item = { type: 'folder-fetch', folder: folder, url: url, folderName: name };
                        downloadQueue.push(item);
                        structEntry.links.push({ type: 'FOLDER', name: name + " (See Subfolder)", url: url });
                        totalItemsFound++;
                    } else {
                        const item = { type: 'file', folder, url, originalName: name, finalFileName: name };
                        downloadQueue.push(item);
                        structEntry.files.push(item);
                        totalItemsFound++;
                    }
                }
            });

            if (allowedTypes.includes('OTHER')) {
                const pageLinks = findAllElements(OZU_SELECTORS.pages, section);
                if(pageLinks) {
                    pageLinks.forEach(link => {
                        let name = link.querySelector('.instancename')?.childNodes[0].textContent || link.innerText;
                        name = name.trim();
                        if (name && link.href) structEntry.links.push({ type: 'LINK', name: name, url: link.href });
                    });
                }
            }
            if (structEntry.files.length > 0 || structEntry.links.length > 0) courseStructure.push(structEntry);
        });

        if (totalItemsFound === 0) { alert("No matching content found."); btn.innerText=originalText; btn.disabled=false; return; }

        // --- DOWNLOAD PHASE ---
        btn.innerText = `⏳ Downloading...`;
        
        const fetchPromises = downloadQueue.map(async (item) => {
            try {
                if (item.type === 'folder-fetch') {
                    // --- FOLDER LOGIC ---
                    const response = await fetch(item.url);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const htmlText = await response.text();
                    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
                    
                    const subZipFolder = item.folder.folder(item.folderName);
                    const fileLinks = doc.querySelectorAll('.fp-filename-icon a, .file-picker a'); 
                    
                    if (fileLinks.length === 0) {
                        subZipFolder.file("Empty.txt", "No files found.");
                        return;
                    }

                    const subPromises = Array.from(fileLinks).map(async (subLink) => {
                        try {
                            const subUrl = subLink.href;
                            let subName = subLink.querySelector('.fp-filename')?.innerText || subLink.innerText;
                            subName = sanitizeFilename(subName);
                            
                            const subRes = await fetch(subUrl);
                            const subBlob = await subRes.blob();
                            
                            // 🔥 FIX: BASE64
                            const base64Data = await blobToBase64(subBlob);
                            subZipFolder.file(subName, base64Data, {base64: true});

                        } catch (subErr) {
                            subZipFolder.file("Error_File.txt", "Failed: " + subErr.message);
                        }
                    });
                    await Promise.allSettled(subPromises);
                
                } else {
                    // --- FILE LOGIC ---
                    const response = await fetch(item.url);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('text/html')) throw new Error("Redirected to webpage (Login required?)");

                    const blob = await response.blob();
                    
                    // Extension check
                    if (!item.finalFileName.includes('.')) {
                        const t = blob.type;
                        if (t.includes('pdf')) item.finalFileName += ".pdf";
                        else if (t.includes('word')) item.finalFileName += ".docx";
                        else if (t.includes('presentation')) item.finalFileName += ".pptx";
                        else if (t.includes('zip')) item.finalFileName += ".zip";
                        else if (t.includes('excel') || t.includes('sheet')) item.finalFileName += ".xlsx";
                    }

                    // 🔥 FIX: BASE64
                    const base64Data = await blobToBase64(blob);
                    
                    // Note: {base64: true} tells JSZip to decode it back to binary
                    item.folder.file(item.finalFileName, base64Data, {base64: true});
                }
            } catch (err) {
                const msg = `FAILED: ${item.originalName || item.folderName} - ${err.message}`;
                console.warn(msg);
                errorLog.push(msg);
                item.folder.file((item.originalName || "Error") + "_LOG.txt", msg);
                item.error = true;
            }
        });

        await Promise.allSettled(fetchPromises);

        if (errorLog.length > 0) zip.file("!_ERROR_REPORT.txt", errorLog.join('\n'));

        btn.innerText = "📝 Building Index...";
        generateIndexHtml(zip, courseStructure, document.title || "Course Archive");

        btn.innerText = "📦 Zipping...";
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `${sanitizeFilename(document.title)}_Archive.zip`;
        document.body.append(a); a.click(); a.remove();

        btn.innerText = "✅ Done";
        setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 4000);

    } catch (e) {
        console.error(e);
        alert("Error: " + e.message);
        btn.innerText = "❌ Error";
    }
}

// 6. Index Generator
function generateIndexHtml(zip, structure, title) {
    let totalFiles = 0; structure.forEach(s => totalFiles += s.files.length + s.links.length);
    const styles = `body{font-family:'Segoe UI',sans-serif;background:#f4f6f8;color:#333;margin:0}.container{max-width:900px;margin:40px auto;padding:20px}.header{background:white;padding:30px;border-radius:12px;border-top:5px solid #d6001c;text-align:center;box-shadow:0 4px 10px rgba(0,0,0,0.05)}.search{width:100%;padding:12px;border:2px solid #eee;border-radius:25px;margin-top:15px;outline:none}.section{background:white;border-radius:8px;margin-top:20px;overflow:hidden}.s-head{background:#2c3e50;color:white;padding:12px 20px;font-weight:600}ul{list-style:none;padding:0;margin:0}li{padding:12px 20px;border-bottom:1px solid #f9f9f9;display:flex;align-items:center}a{text-decoration:none;color:#333;flex:1}.badge{font-size:0.7em;padding:3px 8px;border-radius:4px;margin-right:10px;color:white;min-width:50px;text-align:center;font-weight:bold}.b-file{background:#3498db}.b-folder{background:#f39c12}.b-link{background:#9b59b6}.b-err{background:#e74c3c}.hidden{display:none!important}`;
    const script = `function filter(){const v=document.getElementById('s').value.toLowerCase();document.querySelectorAll('.section').forEach(s=>{let m=false;s.querySelectorAll('li').forEach(l=>{const t=l.innerText.toLowerCase();if(t.includes(v)){l.classList.remove('hidden');m=true}else l.classList.add('hidden')});const ti=s.querySelector('.s-head').innerText.toLowerCase();if(ti.includes(v)||m){s.classList.remove('hidden');if(ti.includes(v))s.querySelectorAll('li').forEach(l=>l.classList.remove('hidden'))}else s.classList.add('hidden')})}`;
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${styles}</style></head><body><div class="container"><div class="header"><h1>${title}</h1><p>${structure.length} Weeks • ${totalFiles} Items</p><input type="text" id="s" class="search" onkeyup="filter()" placeholder="🔍 Search..."></div>`;
    structure.forEach(sec => {
        html += `<div class="section"><div class="s-head">${sec.title}</div><ul>`;
        sec.files.forEach(f => {
            if(f.error) html += `<li><span class="badge b-err">ERR</span>${f.originalName} (See Log)</li>`;
            else html += `<li><span class="badge ${f.isLocalPage?'b-page':'b-file'}">${f.isLocalPage?'PAGE':'FILE'}</span><a href="${encodeURIComponent(sec.title)}/${encodeURIComponent(f.finalFileName)}" target="_blank">${f.originalName}</a></li>`;
        });
        sec.links.forEach(l => {
            const isFolder = l.type === 'FOLDER';
            html += `<li><span class="badge ${isFolder?'b-folder':'b-link'}">${isFolder?'DIR':'LINK'}</span><a href="${l.url}" target="_blank">${l.name} ↗</a></li>`;
        });
        html += `</ul></div>`;
    });
    html += `</div><script>${script}</script></body></html>`;
    zip.file("index.html", html);
}

// 7. Grade Export
async function exportGrades() {
    const btn = this; const orig = btn.innerText; btn.innerText="Fetching...";
    try {
        const id = new URLSearchParams(window.location.search).get('id');
        const origin = window.location.origin;
        const r = await fetch(`${origin}/grade/report/user/index.php?id=${id}`);
        if(!r.ok) throw new Error("Grade page not found");
        const t = await r.text();
        const doc = new DOMParser().parseFromString(t, "text/html");
        
        let csv = "Item,Grade,Range,Percentage,Feedback\n";
        const rows = doc.querySelectorAll('table.user-grade tbody tr, table.generaltable tbody tr');
        
        rows.forEach(row => {
            const c = Array.from(row.querySelectorAll('td,th')).map(x=>x.innerText.replace(/,/g," ").trim());
            if(c.length > 2) csv += c.slice(0,5).join(",")+"\n";
        });
        
        const a = document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
        a.download=`Grades_${id}.csv`; a.click(); btn.innerText="✅ Done";
    } catch(e) { console.error(e); alert("Could not fetch grades."); btn.innerText="❌ Error"; }
    setTimeout(()=>btn.innerText=orig, 2000);
}

// Init
window.addEventListener('load', addDownloadButton);
if (document.readyState === 'complete') addDownloadButton();