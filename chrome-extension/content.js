// 1. Inject Buttons
function addDownloadButton() {
    const header = document.querySelector('.page-header-headings') || document.querySelector('h1');
    if (header) {
        const div = document.createElement('div');
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

// 2. Helper: Sanitize Filenames
function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9áéíóúñü \.\-_]/gim, "").trim();
}

// 3. Helper: Deduplicate Filenames
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

// 4. Helper: Wrap Page Content (Offline View)
function wrapLocalPage(title, contentHtml) {
    const styles = `
        body { font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.6; color: #333; margin: 0; background: #f9f9f9; }
        .page-container { max-width: 800px; margin: 40px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        h1.local-title { color: #d6001c; border-bottom: 2px solid #eee; padding-bottom: 15px; margin-top: 0; }
        .meta { font-size: 0.85em; color: #888; margin-bottom: 30px; }
        img { max-width: 100%; height: auto; }
        a { color: #d6001c; text-decoration: none; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; }
        th { background-color: #f2f2f2; }
    `;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${styles}</style></head><body><div class="page-container"><h1 class="local-title">${title}</h1><div class="meta">Archived from LMS • Offline Mode</div><div class="moodle-content">${contentHtml}</div></div></body></html>`;
}

// 5. Helper: Advanced File Type Detection
function detectTypeFromDOM(linkElement) {
    const icon = linkElement.querySelector('img.icon');
    let src = icon ? icon.src.toLowerCase() : "";
    const href = linkElement.href.toLowerCase();
    
    // Check HREF extensions first (more accurate)
    if (href.endsWith('.pdf')) return 'PDF';
    if (href.match(/\.(ppt|pptx)$/)) return 'PPT';
    if (href.match(/\.(doc|docx)$/)) return 'DOC';
    if (href.match(/\.(xls|xlsx|csv)$/)) return 'XLS';
    if (href.match(/\.(zip|rar|7z|tar|gz)$/)) return 'ZIP';
    if (href.match(/\.(jpg|jpeg|png|gif|svg)$/)) return 'IMG';
    if (href.match(/\.(py|java|c|cpp|h|cs|js|html|css|php|sql)$/)) return 'CODE';
    if (href.match(/\.(mp4|mov|avi|mp3|wav)$/)) return 'MEDIA';

    // Fallback to Icon URL
    if (src.includes('pdf')) return 'PDF';
    if (src.includes('powerpoint')) return 'PPT';
    if (src.includes('word')) return 'DOC';
    if (src.includes('spreadsheet') || src.includes('excel')) return 'XLS';
    if (src.includes('archive') || src.includes('zip')) return 'ZIP';
    if (src.includes('image') || src.includes('jpeg')) return 'IMG';
    if (src.includes('text') || src.includes('source')) return 'CODE';
    if (src.includes('video') || src.includes('audio')) return 'MEDIA';
    
    return 'OTHER';
}

// 6. Helper: Modal Logic with Expanded Filters
function promptUserForSections(sectionsMap) {
    return new Promise((resolve) => {
        // --- PRE-SCAN FOR TYPES ---
        const availableTypes = new Set();
        sectionsMap.forEach(sec => {
            sec.element.querySelectorAll('.activity.resource a').forEach(link => {
                availableTypes.add(detectTypeFromDOM(link));
            });
        });

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

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, { padding: '20px', borderBottom: '1px solid #eee' });
        header.innerHTML = `<h3 style="margin:0; color:#d6001c;">Download Manager</h3><p style="margin:5px 0 0; color:#666; font-size:0.9em;">Select materials to archive.</p>`;
        modal.appendChild(header);

        // Content Area
        const content = document.createElement('div');
        Object.assign(content.style, { display: 'flex', flexGrow: 1, overflow: 'hidden' });
        
        // Left: Weeks
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

        // Right: Filters
        const rightPanel = document.createElement('div');
        Object.assign(rightPanel.style, { width: '45%', padding: '15px', backgroundColor: '#f9f9f9' });
        rightPanel.innerHTML = `<div style="font-weight:bold; margin-bottom:10px; color:#2c3e50;">📂 File Types</div>`;
        
        const typeCheckboxes = {};
        const typeLabels = { 
            'PDF': '📄 PDF Documents', 
            'PPT': '📊 PowerPoint (PPTX)', 
            'DOC': '📝 Word (DOCX)', 
            'XLS': '📈 Excel (XLSX, CSV)', 
            'ZIP': '📦 Archives (ZIP, RAR)',
            'CODE': '💻 Code & Text (py, c, txt)',
            'IMG': '🖼️ Images',
            'MEDIA': '🎥 Audio / Video',
            'OTHER': '📁 Other Files'
        };
        
        // Show categories
        const filtersToShow = ['PDF', 'PPT', 'DOC', 'XLS', 'ZIP', 'CODE', 'IMG', 'MEDIA', 'OTHER'];
        filtersToShow.forEach(type => {
            // Optional: Hide if not present on page (Remove this if you want to show all always)
            // if (!availableTypes.has(type) && type !== 'OTHER') return; 

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

        // Footer
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

// 7. Main Logic
async function startDownloadProcess() {
    const btn = this;
    const originalText = btn.innerText;
    
    try {
        const sectionsList = document.querySelectorAll('ul.weeks li[id^="section-"]');
        if (sectionsList.length === 0) { alert("No sections found."); return; }

        const sectionsMap = Array.from(sectionsList).map(section => {
            let name = section.getAttribute('aria-label') || section.querySelector('.sectionname')?.innerText || section.id;
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

            // A. FILES
            section.querySelectorAll('.activity.resource a').forEach((link) => {
                const detectedType = detectTypeFromDOM(link);
                if (!allowedTypes.includes(detectedType)) return;

                const url = link.href;
                let name = link.querySelector('.instancename')?.childNodes[0].textContent || link.innerText;
                name = sanitizeFilename(name);
                name = getUniqueName(name, usedFilenames);

                if (url && name) {
                    const item = { type: 'file', folder, url, originalName: name, finalFileName: name, sectionPath: sectionName };
                    downloadQueue.push(item);
                    structEntry.files.push(item);
                    totalItemsFound++;
                }
            });

            // B. LINKS & PAGES
            section.querySelectorAll('.activity.url a, .activity.page a').forEach((link) => {
                let type = "Link";
                const parent = link.closest('.activity');
                if (parent.classList.contains('page')) type = "Page";
                
                let name = link.querySelector('.instancename')?.childNodes[0].textContent || link.innerText;
                name = name.trim();
                const url = link.href;

                if (name && url) {
                    if (type === "Page") {
                        let pageFileName = sanitizeFilename(name) + ".html";
                        pageFileName = getUniqueName(pageFileName, usedFilenames);
                        const item = { type: 'page-fetch', folder, url, finalFileName: pageFileName, title: name };
                        downloadQueue.push(item);
                        structEntry.files.push({ finalFileName: pageFileName, originalName: name, isLocalPage: true });
                        totalItemsFound++;
                    } else {
                        structEntry.links.push({ type: type, name: name, url: url });
                        totalItemsFound++;
                    }
                }
            });

            if (structEntry.files.length > 0 || structEntry.links.length > 0) courseStructure.push(structEntry);
        });

        if (totalItemsFound === 0) { alert("No matching files found."); btn.innerText=originalText; btn.disabled=false; return; }

        // --- DOWNLOAD PHASE ---
        btn.innerText = `⏳ Processing ${downloadQueue.length} items...`;
        
        const fetchPromises = downloadQueue.map(async (item) => {
            try {
                const response = await fetch(item.url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                // PAGE Logic
                if (item.type === 'page-fetch') {
                    const fullHtml = await response.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(fullHtml, 'text/html');
                    let content = doc.querySelector('.box.generalbox')?.innerHTML || doc.querySelector('[role="main"]')?.innerHTML || "<p>Content not found</p>";
                    item.folder.file(item.finalFileName, wrapLocalPage(item.title, content));
                } 
                // FILE Logic
                else {
                    // Check headers to prevent HTML-saved-as-XLS error
                    const contentType = response.headers.get('content-type');
                    
                    // If we expect a binary file but get HTML, it's an error (e.g. Login page redirection)
                    if (contentType && contentType.includes('text/html')) {
                        throw new Error("Target is a webpage, not a file (Login or Redirect issue).");
                    }

                    const blob = await response.blob();
                    
                    // Handle Extensions
                    if (!item.originalName.includes('.')) {
                        const t = blob.type;
                        if (t.includes('pdf')) item.finalFileName += ".pdf";
                        else if (t.includes('word')) item.finalFileName += ".docx";
                        else if (t.includes('presentation')) item.finalFileName += ".pptx";
                        else if (t.includes('spreadsheet') || t.includes('excel')) item.finalFileName += ".xlsx";
                        else if (t.includes('zip')) item.finalFileName += ".zip";
                    }
                    item.folder.file(item.finalFileName, blob);
                }
            } catch (err) {
                // LOGGING
                const errMsg = `FAILED: ${item.originalName} - Reason: ${err.message}`;
                console.warn(errMsg); // Show in console
                errorLog.push(errMsg); // Add to global log
                
                // Add specific error file in folder
                item.folder.file(`${item.originalName}_FAILED.txt`, `Download URL: ${item.url}\nError: ${err.message}`);
                item.error = true;
            }
        });

        await Promise.allSettled(fetchPromises);

        // --- GENERATE GLOBAL ERROR REPORT ---
        if (errorLog.length > 0) {
            const reportContent = `
========================================
   Ozyegin LMS Downloader - Error Log
========================================
Total Errors: ${errorLog.length}

${errorLog.join('\n\n')}

========================================
TROUBLESHOOTING:
1. "Target is a webpage": The file link was actually a redirect to a login page.
2. "HTTP 403/404": The file is hidden or deleted by the professor.
3. "Network Error": Check your internet connection.
            `;
            zip.file("!_ERROR_REPORT.txt", reportContent);
        }

        // --- FINALIZE ---
        btn.innerText = "📝 Building Site...";
        generateIndexHtml(zip, courseStructure, document.title || "Course");

        btn.innerText = "📦 Zipping...";
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `${sanitizeFilename(document.title)}_Archive.zip`;
        document.body.append(a); a.click(); a.remove();

        // Final Alert
        if (errorLog.length > 0) {
            alert(`⚠️ Download Complete with ${errorLog.length} errors.\n\nPlease check the '!_ERROR_REPORT.txt' inside the zip file.`);
        } else {
            alert("✅ Download Successful!");
        }
        
        btn.innerText = "✅ Done";
        setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 3000);

    } catch (e) {
        console.error(e);
        alert("Critical Error: " + e.message);
        btn.innerText = "❌ Error";
    }
}

// 8. Index Generator (Same as before)
function generateIndexHtml(zip, structure, title) {
    let totalFiles = 0; structure.forEach(s => totalFiles += s.files.length + s.links.length);
    const styles = `body{font-family:'Segoe UI',sans-serif;background:#f4f6f8;color:#333;margin:0}.container{max-width:900px;margin:40px auto;padding:20px}.header{background:white;padding:30px;border-radius:12px;border-top:5px solid #d6001c;text-align:center;box-shadow:0 4px 10px rgba(0,0,0,0.05)}.search{width:100%;padding:12px;border:2px solid #eee;border-radius:25px;margin-top:15px;outline:none}.section{background:white;border-radius:8px;margin-top:20px;overflow:hidden}.s-head{background:#2c3e50;color:white;padding:12px 20px;font-weight:600}ul{list-style:none;padding:0;margin:0}li{padding:12px 20px;border-bottom:1px solid #f9f9f9;display:flex;align-items:center}a{text-decoration:none;color:#333;flex:1}.badge{font-size:0.7em;padding:3px 8px;border-radius:4px;margin-right:10px;color:white;min-width:50px;text-align:center;font-weight:bold}.b-file{background:#3498db}.b-page{background:#e67e22}.b-link{background:#9b59b6}.b-err{background:#e74c3c}.hidden{display:none!important}`;
    const script = `function filter(){const v=document.getElementById('s').value.toLowerCase();document.querySelectorAll('.section').forEach(s=>{let m=false;s.querySelectorAll('li').forEach(l=>{const t=l.innerText.toLowerCase();if(t.includes(v)){l.classList.remove('hidden');m=true}else l.classList.add('hidden')});const ti=s.querySelector('.s-head').innerText.toLowerCase();if(ti.includes(v)||m){s.classList.remove('hidden');if(ti.includes(v))s.querySelectorAll('li').forEach(l=>l.classList.remove('hidden'))}else s.classList.add('hidden')})}`;
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${styles}</style></head><body><div class="container"><div class="header"><h1>${title}</h1><p>${structure.length} Weeks • ${totalFiles} Items</p><input type="text" id="s" class="search" onkeyup="filter()" placeholder="🔍 Search..."></div>`;
    structure.forEach(sec => {
        html += `<div class="section"><div class="s-head">${sec.title}</div><ul>`;
        sec.files.forEach(f => {
            if(f.error) html += `<li><span class="badge b-err">ERR</span>${f.originalName} (See Log)</li>`;
            else html += `<li><span class="badge ${f.isLocalPage?'b-page':'b-file'}">${f.isLocalPage?'PAGE':'FILE'}</span><a href="${encodeURIComponent(sec.title)}/${encodeURIComponent(f.finalFileName)}" target="_blank">${f.originalName}</a></li>`;
        });
        sec.links.forEach(l => html += `<li><span class="badge b-link">${l.type.toUpperCase()}</span><a href="${l.url}" target="_blank">${l.name} ↗</a></li>`);
        html += `</ul></div>`;
    });
    html += `</div><script>${script}</script></body></html>`;
    zip.file("index.html", html);
}

// 9. Grade Export
async function exportGrades() {
    const btn = this; const orig = btn.innerText; btn.innerText="Fetching...";
    try {
        const id = new URLSearchParams(window.location.search).get('id');
        const r = await fetch(`https://lms.ozyegin.edu.tr/grade/report/user/index.php?id=${id}`);
        const t = await r.text();
        const doc = new DOMParser().parseFromString(t, "text/html");
        let csv = "Item,Grade,Range,Percentage,Feedback\n";
        doc.querySelectorAll('table tbody tr').forEach(row => {
            const c = Array.from(row.querySelectorAll('td,th')).map(x=>x.innerText.replace(/,/g," ").trim());
            if(c.length>1) csv += c.slice(0,5).join(",")+"\n";
        });
        const a = document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
        a.download=`Grades_${id}.csv`; a.click(); btn.innerText="✅ Done";
    } catch(e) { console.error(e); btn.innerText="❌ Error"; }
    setTimeout(()=>btn.innerText=orig, 2000);
}

window.addEventListener('load', addDownloadButton);
if (document.readyState === 'complete') addDownloadButton();