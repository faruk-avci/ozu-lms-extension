// --- 1. CONFIGURATION & HELPERS ---

const OZU_SELECTORS = {
    header: ['.page-header-headings', '.page-header h1', 'h1'],
    sections: ['ul.weeks li.section', 'ul.topics li.section', 'li[id^="section-"]'],
    sectionTitle: ['.sectionname', '[aria-label]'],
    resources: ['.activity.resource a', '.modtype_resource a'],
    folders: ['.activity.folder a', '.modtype_folder a'],
    assigns: ['.activity.assign a', '.modtype_assign a'],
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

    if (href.includes('/mod/assign/')) return 'ASSIGN';
    if (href.includes('/mod/folder/')) return 'FOLDER';

    // Strip query parameters to make extension matching more robust
    const cleanHref = href.split('?')[0];

    if (cleanHref.endsWith('.pdf')) return 'PDF';
    if (cleanHref.match(/\.(ppt|pptx)$/)) return 'PPT';
    if (cleanHref.match(/\.(doc|docx)$/)) return 'DOC';
    if (cleanHref.match(/\.(xls|xlsx|csv)$/)) return 'XLS';
    if (cleanHref.match(/\.(zip|rar|7z|tar|gz)$/)) return 'ZIP';
    if (cleanHref.match(/\.(jpg|jpeg|png|gif|svg)$/)) return 'IMG';
    if (cleanHref.match(/\.(py|java|c|cpp|h|cs|js|html|css|php|sql)$/)) return 'CODE';
    if (cleanHref.match(/\.(mp4|mov|avi|mp3|wav)$/)) return 'MEDIA';

    if (src.includes('pdf')) return 'PDF';
    if (src.includes('powerpoint')) return 'PPT';
    if (src.includes('word')) return 'DOC';
    if (src.includes('spreadsheet') || src.includes('excel')) return 'XLS';
    if (src.includes('archive') || src.includes('zip')) return 'ZIP';
    if (src.includes('folder')) return 'FOLDER';

    return 'OTHER';
}

// --- 4. PRE-SCAN LOGIC ---

async function preScanSections(sectionsMap) {
    const promises = sectionsMap.map(async (sec, index) => {
        const section = sec.element;
        const items = [];

        const allLinks = [
            ...findAllElements(OZU_SELECTORS.resources, section),
            ...findAllElements(OZU_SELECTORS.folders, section),
            ...findAllElements(OZU_SELECTORS.assigns, section)
        ];

        const usedFilenames = new Set();
        const linkPromises = allLinks.map(async (link) => {
            const detectedType = detectTypeFromDOM(link);
            const url = link.href;
            let name = link.querySelector('.instancename')?.childNodes[0].textContent || link.innerText;
            name = sanitizeFilename(name);
            name = getUniqueName(name, usedFilenames);

            if (!url || !name) return;

            if (detectedType === 'FOLDER') {
                try {
                    const res = await fetch(url);
                    if (res.ok) {
                        const html = await res.text();
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const fileLinks = doc.querySelectorAll('.fp-filename-icon a, .file-picker a');
                        fileLinks.forEach(subLink => {
                            let subName = subLink.querySelector('.fp-filename')?.innerText || subLink.innerText;
                            subName = sanitizeFilename(subName);
                            items.push({ name: subName, url: subLink.href, type: detectTypeFromDOM(subLink), folderPath: name });
                        });
                    }
                } catch(e) {}
            } else if (detectedType === 'ASSIGN') {
                try {
                    const res = await fetch(url);
                    if (res.ok) {
                        const html = await res.text();
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        
                        const attachSection = doc.querySelector('.activity-description, #intro');
                        const attachLinks = attachSection ? attachSection.querySelectorAll('.fileuploadsubmission a[href*="pluginfile.php"]') : [];
                        attachLinks.forEach(subLink => {
                            let subName = sanitizeFilename(subLink.textContent.trim()) || 'unknown';
                            items.push({ name: subName, url: subLink.href, type: detectTypeFromDOM(subLink), folderPath: `${name}/Attachments` });
                        });

                        const submitSection = doc.querySelector('.submissionstatustable');
                        const submitLinks = submitSection ? submitSection.querySelectorAll('.fileuploadsubmission a[href*="pluginfile.php"]') : [];
                        submitLinks.forEach(subLink => {
                            let subName = sanitizeFilename(subLink.textContent.trim()) || 'unknown';
                            items.push({ name: subName, url: subLink.href, type: detectTypeFromDOM(subLink), folderPath: `${name}/Submissions` });
                        });
                    }
                } catch(e) {}
            } else {
                items.push({ name, url, type: detectedType });
            }
        });
        await Promise.all(linkPromises);

        // Also collect page/url links as OTHER
        const pageLinks = findAllElements(OZU_SELECTORS.pages, section);
        if (pageLinks) {
            pageLinks.forEach(link => {
                let name = link.querySelector('.instancename')?.childNodes[0].textContent || link.innerText;
                name = name.trim();
                name = getUniqueName(name, usedFilenames);
                if (name && link.href) {
                    items.push({ name, url: link.href, type: 'LINK', link });
                }
            });
        }

        return { sectionIndex: index, sectionName: sec.name, items };
    });
    return Promise.all(promises);
}

// --- 5. MODAL LOGIC ---

const TYPE_ICONS = {
    'FOLDER': '📁', 'ASSIGN': '📝', 'PDF': '📄', 'PPT': '📊', 'DOC': '📝',
    'XLS': '📈', 'ZIP': '📦', 'CODE': '💻', 'IMG': '🖼️', 'MEDIA': '🎥',
    'OTHER': '📁', 'LINK': '🔗'
};
const TYPE_COLORS = {
    'FOLDER': '#f39c12', 'ASSIGN': '#e67e22', 'PDF': '#e74c3c', 'PPT': '#e67e22',
    'DOC': '#3498db', 'XLS': '#27ae60', 'ZIP': '#8e44ad', 'CODE': '#2c3e50',
    'IMG': '#1abc9c', 'MEDIA': '#9b59b6', 'OTHER': '#95a5a6', 'LINK': '#9b59b6'
};

function promptUserForFiles(scannedSections) {
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
            width: '900px', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontFamily: 'Segoe UI, sans-serif', overflow: 'hidden'
        });

        // --- HEADER ---
        const header = document.createElement('div');
        Object.assign(header.style, { padding: '20px', borderBottom: '1px solid #eee' });
        const totalFiles = scannedSections.reduce((s, sec) => s + sec.items.length, 0);
        header.innerHTML = `<h3 style="margin:0; color:#d6001c;">Download Manager</h3><p style="margin:5px 0 0; color:#666; font-size:0.9em;">Found <strong>${totalFiles}</strong> items across <strong>${scannedSections.filter(s => s.items.length > 0).length}</strong> sections. Select what to download.</p>`;
        modal.appendChild(header);

        // --- CONTENT ---
        const content = document.createElement('div');
        Object.assign(content.style, { display: 'flex', flexGrow: 1, overflow: 'hidden' });

        // LEFT: Tree view with per-file checkboxes
        const leftPanel = document.createElement('div');
        Object.assign(leftPanel.style, { width: '68%', borderRight: '1px solid #eee', overflowY: 'auto', padding: '15px' });
        leftPanel.innerHTML = `<div style="font-weight:bold; margin-bottom:10px; color:#2c3e50;">📅 Weeks & Files</div>`;

        const allFileCheckboxes = []; // track all file checkboxes for All/None buttons
        const sectionGroups = []; // { weekChk, fileChks[], countBadge }

        scannedSections.forEach(sec => {
            if (sec.items.length === 0) return;

            const group = document.createElement('div');
            Object.assign(group.style, { marginBottom: '8px', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' });

            // Section header row
            const sectionHeader = document.createElement('div');
            Object.assign(sectionHeader.style, {
                display: 'flex', alignItems: 'center', padding: '10px 12px',
                backgroundColor: '#f8f9fa', cursor: 'pointer', userSelect: 'none'
            });

            const weekChk = document.createElement('input');
            weekChk.type = 'checkbox'; weekChk.checked = true;
            Object.assign(weekChk.style, { marginRight: '10px', flexShrink: 0 });
            weekChk.dataset.sectionIndex = sec.sectionIndex;

            const arrow = document.createElement('span');
            arrow.textContent = '▼';
            Object.assign(arrow.style, { marginRight: '8px', fontSize: '0.7em', transition: 'transform 0.2s', color: '#999' });

            const nameSpan = document.createElement('span');
            nameSpan.textContent = sec.sectionName;
            Object.assign(nameSpan.style, { fontWeight: '600', fontSize: '0.93em', flex: 1 });

            const countBadge = document.createElement('span');
            Object.assign(countBadge.style, {
                fontSize: '0.75em', padding: '2px 8px', borderRadius: '10px',
                backgroundColor: '#d6001c', color: 'white', fontWeight: 'bold', marginLeft: 'auto'
            });
            countBadge.textContent = `${sec.items.length}/${sec.items.length}`;

            sectionHeader.append(weekChk, arrow, nameSpan, countBadge);

            // File list
            const fileList = document.createElement('div');
            Object.assign(fileList.style, { padding: '0', maxHeight: '300px', overflowY: 'auto', transition: 'max-height 0.3s' });

            const fileChks = [];

            // GROUP FILES BY folderPath
            const tree = { _: [] }; // _: loose files
            sec.items.forEach((item, itemIdx) => {
                if (item.folderPath) {
                    const topFolder = item.folderPath.split('/')[0];
                    if (!tree[topFolder]) tree[topFolder] = [];
                    tree[topFolder].push({ item, itemIdx });
                } else {
                    tree._.push({ item, itemIdx });
                }
            });

            // Update function for week badge
            function updateWeekCount() {
                const checkedCount = fileChks.filter(c => c.checked).length;
                countBadge.textContent = `${checkedCount}/${fileChks.length}`;
                weekChk.checked = checkedCount > 0;
                weekChk.indeterminate = checkedCount > 0 && checkedCount < fileChks.length;
                updateTotalCount();
            }

            // Helper to render a file row
            function renderFileRow(item, itemIdx, parentDiv, isIndented) {
                const row = document.createElement('label');
                Object.assign(row.style, {
                    display: 'flex', alignItems: 'center', padding: isIndented ? '7px 12px 7px 56px' : '7px 12px 7px 36px',
                    cursor: 'pointer', fontSize: '0.88em', borderTop: '1px solid #f0f0f0',
                    transition: 'background 0.15s'
                });
                row.onmouseenter = () => row.style.backgroundColor = '#f5f5f5';
                row.onmouseleave = () => row.style.backgroundColor = '';

                const fileChk = document.createElement('input');
                fileChk.type = 'checkbox'; fileChk.checked = true;
                Object.assign(fileChk.style, { marginRight: '10px', flexShrink: 0 });
                fileChk.dataset.sectionIndex = sec.sectionIndex;
                fileChk.dataset.itemIndex = itemIdx;
                fileChk.dataset.fileType = item.type;

                const typeBadge = document.createElement('span');
                Object.assign(typeBadge.style, {
                    fontSize: '0.72em', padding: '2px 6px', borderRadius: '4px',
                    color: 'white', fontWeight: 'bold', marginRight: '8px', flexShrink: 0,
                    backgroundColor: TYPE_COLORS[item.type] || '#95a5a6', minWidth: '42px', textAlign: 'center'
                });
                typeBadge.textContent = item.type;

                const fileNameSpan = document.createElement('span');
                // If it's a deep path like Assign1/Attachments, strip the "Assign1/"
                let displayPath = '';
                if (item.folderPath) {
                    const parts = item.folderPath.split('/');
                    if (parts.length > 1) displayPath = parts.slice(1).join(' / ');
                }
                fileNameSpan.textContent = displayPath ? `${displayPath} / ${item.name}` : item.name;
                Object.assign(fileNameSpan.style, { wordBreak: 'break-word', color: '#333' });

                row.append(fileChk, typeBadge, fileNameSpan);
                parentDiv.appendChild(row);
                fileChks.push(fileChk);
                allFileCheckboxes.push(fileChk);
                return fileChk;
            }

            // Render loose files
            tree._.forEach(({item, itemIdx}) => {
                const fileChk = renderFileRow(item, itemIdx, fileList, false);
                fileChk.addEventListener('change', updateWeekCount);
            });

            // Keep track of folder/assign header update callbacks for the Type Filter
            const folderUpdateCbs = [];

            // Render collapsible folders/assignments
            Object.keys(tree).forEach(topFolder => {
                if (topFolder === '_') return;

                const folderGroup = document.createElement('div');
                Object.assign(folderGroup.style, { borderTop: '1px solid #f0f0f0' });

                const fHeader = document.createElement('div');
                Object.assign(fHeader.style, {
                    display: 'flex', alignItems: 'center', padding: '6px 12px 6px 36px',
                    backgroundColor: '#fafafa', cursor: 'pointer', userSelect: 'none'
                });

                const fChk = document.createElement('input');
                fChk.type = 'checkbox'; fChk.checked = true;
                Object.assign(fChk.style, { marginRight: '8px', flexShrink: 0 });

                const fArrow = document.createElement('span');
                fArrow.textContent = '▼';
                Object.assign(fArrow.style, { marginRight: '6px', fontSize: '0.65em', transition: 'transform 0.2s', color: '#999' });

                // Detect if it's an assignment (Submissions/Attachments presence)
                const isAssign = tree[topFolder].some(i => i.item.folderPath.includes('/Submissions') || i.item.folderPath.includes('/Attachments'));
                
                const typeIcon = document.createElement('span');
                Object.assign(typeIcon.style, {
                    fontSize: '0.72em', padding: '2px 6px', borderRadius: '4px',
                    color: 'white', fontWeight: 'bold', marginRight: '8px', flexShrink: 0,
                    backgroundColor: isAssign ? TYPE_COLORS['ASSIGN'] : TYPE_COLORS['FOLDER']
                });
                typeIcon.textContent = isAssign ? 'ASSIGN' : 'FOLDER';

                const fNameSpan = document.createElement('span');
                fNameSpan.textContent = topFolder;
                Object.assign(fNameSpan.style, { fontWeight: '600', fontSize: '0.88em', flex: 1, color: '#444' });

                const fCountBadge = document.createElement('span');
                Object.assign(fCountBadge.style, {
                    fontSize: '0.7em', padding: '1px 6px', borderRadius: '8px',
                    backgroundColor: '#bbb', color: 'white', fontWeight: 'bold', marginLeft: 'auto'
                });

                fHeader.append(fChk, fArrow, typeIcon, fNameSpan, fCountBadge);

                const fItemsList = document.createElement('div');
                Object.assign(fItemsList.style, { maxHeight: '300px', overflowY: 'auto', transition: 'max-height 0.3s' });

                const innerChks = [];
                tree[topFolder].forEach(({item, itemIdx}) => {
                    const fileChk = renderFileRow(item, itemIdx, fItemsList, true);
                    innerChks.push(fileChk);
                    fileChk.addEventListener('change', updateFolderState);
                });
                
                function updateFolderState() {
                    const visibleChks = innerChks.filter(c => c.closest('label').style.display !== 'none');
                    const count = visibleChks.filter(c => c.checked).length;
                    fCountBadge.textContent = `${count}/${innerChks.length}`;
                    fChk.checked = count > 0;
                    fChk.indeterminate = count > 0 && count < visibleChks.length;
                    updateWeekCount();
                }
                
                fCountBadge.textContent = `${innerChks.length}/${innerChks.length}`;
                folderUpdateCbs.push(updateFolderState);

                let fCollapsed = false;
                fHeader.addEventListener('click', (e) => {
                    if (e.target === fChk) return;
                    fCollapsed = !fCollapsed;
                    fItemsList.style.maxHeight = fCollapsed ? '0px' : '300px';
                    fItemsList.style.overflow = fCollapsed ? 'hidden' : 'auto';
                    fArrow.style.transform = fCollapsed ? 'rotate(-90deg)' : '';
                });

                fChk.addEventListener('change', () => {
                    innerChks.forEach(c => {
                        if (c.closest('label').style.display !== 'none') {
                            c.checked = fChk.checked;
                        }
                    });
                    updateFolderState();
                });

                folderGroup.append(fHeader, fItemsList);
                fileList.appendChild(folderGroup);
            });

            // Toggle section collapse
            let collapsed = false;
            const toggleCollapse = (e) => {
                if (e.target === weekChk) return; // don't collapse on checkbox click
                collapsed = !collapsed;
                fileList.style.maxHeight = collapsed ? '0px' : '9999px'; // Use large maxHeight for arbitrarily deep lists
                fileList.style.overflow = collapsed ? 'hidden' : 'auto';
                arrow.style.transform = collapsed ? 'rotate(-90deg)' : '';
            };
            sectionHeader.addEventListener('click', toggleCollapse);

            // Week checkbox toggles all files
            weekChk.addEventListener('change', () => {
                fileChks.forEach(c => {
                    if (c.closest('label').style.display !== 'none') {
                        c.checked = weekChk.checked;
                    }
                });
                weekChk.indeterminate = false;
                folderUpdateCbs.forEach(cb => cb());
                updateWeekCount();
            });

            group.append(sectionHeader, fileList);
            leftPanel.appendChild(group);
            sectionGroups.push({ weekChk, fileChks, countBadge, folderUpdateCbs });
        });

        // RIGHT: File type filters
        const rightPanel = document.createElement('div');
        Object.assign(rightPanel.style, { width: '32%', padding: '15px', backgroundColor: '#f9f9f9', overflowY: 'auto' });
        rightPanel.innerHTML = `<div style="font-weight:bold; margin-bottom:10px; color:#2c3e50;">📂 Filter by Type</div>`;

        const types = ['FOLDER', 'ASSIGN', 'PDF', 'PPT', 'DOC', 'XLS', 'ZIP', 'CODE', 'IMG', 'MEDIA', 'OTHER', 'LINK'];
        const typeLabels = {
            'FOLDER': '📁 Sub-Folders', 'ASSIGN': '📝 Assignments', 'PDF': '📄 PDF Documents',
            'PPT': '📊 PowerPoint', 'DOC': '📝 Word Docs', 'XLS': '📈 Excel / CSV',
            'ZIP': '📦 Archives', 'CODE': '💻 Code', 'IMG': '🖼️ Images',
            'MEDIA': '🎥 Media', 'OTHER': '📁 Other', 'LINK': '🔗 Links'
        };

        // Only show types that actually exist in the scanned data
        const presentTypes = new Set();
        scannedSections.forEach(sec => sec.items.forEach(item => presentTypes.add(item.type)));

        types.forEach(type => {
            if (!presentTypes.has(type)) return;
            const label = document.createElement('label');
            Object.assign(label.style, { display: 'flex', alignItems: 'center', padding: '6px 0', cursor: 'pointer', fontSize: '0.9em' });
            const chk = document.createElement('input');
            chk.type = 'checkbox'; chk.checked = true; chk.style.marginRight = '10px'; chk.dataset.type = type;
            label.append(chk, typeLabels[type] || type);
            rightPanel.appendChild(label);

            // Type filter: toggle visibility of matching file checkboxes
            chk.addEventListener('change', () => {
                allFileCheckboxes.forEach(fc => {
                    if (fc.dataset.fileType === type) {
                        fc.checked = chk.checked;
                        fc.closest('label').style.display = chk.checked ? 'flex' : 'none';
                    }
                });
                // Update all section counts
                sectionGroups.forEach(sg => {
                    if (sg.folderUpdateCbs) sg.folderUpdateCbs.forEach(cb => cb());
                    const visibleChks = sg.fileChks.filter(c => c.closest('label').style.display !== 'none');
                    const checkedCount = visibleChks.filter(c => c.checked).length;
                    sg.countBadge.textContent = `${checkedCount}/${sg.fileChks.length}`;
                    sg.weekChk.checked = checkedCount > 0;
                    sg.weekChk.indeterminate = checkedCount > 0 && checkedCount < sg.fileChks.length;
                });
                updateTotalCount();
            });
        });

        content.append(leftPanel, rightPanel);
        modal.appendChild(content);

        // --- FOOTER ---
        const footer = document.createElement('div');
        Object.assign(footer.style, { padding: '15px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' });

        const leftBtns = document.createElement('div');
        const allBtn = document.createElement('button');
        allBtn.innerText = 'Select All'; allBtn.className = 'btn btn-sm btn-light';
        allBtn.onclick = () => {
            allFileCheckboxes.forEach(c => { c.checked = true; c.closest('label').style.display = 'flex'; });
            sectionGroups.forEach(sg => { 
                if (sg.folderUpdateCbs) sg.folderUpdateCbs.forEach(cb => cb());
                sg.weekChk.checked = true; sg.weekChk.indeterminate = false; sg.countBadge.textContent = `${sg.fileChks.length}/${sg.fileChks.length}`; 
            });
            rightPanel.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = true);
            updateTotalCount();
        };
        const noneBtn = document.createElement('button');
        noneBtn.innerText = 'Deselect All'; noneBtn.className = 'btn btn-sm btn-light'; noneBtn.style.marginLeft = '5px';
        noneBtn.onclick = () => {
            allFileCheckboxes.forEach(c => c.checked = false);
            sectionGroups.forEach(sg => { 
                if (sg.folderUpdateCbs) sg.folderUpdateCbs.forEach(cb => cb());
                sg.weekChk.checked = false; sg.weekChk.indeterminate = false; sg.countBadge.textContent = `0/${sg.fileChks.length}`; 
            });
            updateTotalCount();
        };
        leftBtns.append(allBtn, noneBtn);

        const totalCountSpan = document.createElement('span');
        Object.assign(totalCountSpan.style, { fontSize: '0.88em', color: '#666' });
        function updateTotalCount() {
            const checked = allFileCheckboxes.filter(c => c.checked).length;
            totalCountSpan.textContent = `${checked} of ${allFileCheckboxes.length} selected`;
        }
        updateTotalCount();

        const rightBtns = document.createElement('div');
        rightBtns.style.display = 'flex';
        rightBtns.style.alignItems = 'center';
        rightBtns.style.gap = '10px';
        const cancel = document.createElement('button');
        cancel.innerText = 'Cancel'; cancel.className = 'btn btn-secondary';
        cancel.onclick = () => { document.body.removeChild(overlay); resolve(null); };

        const confirm = document.createElement('button');
        confirm.innerText = 'Start Download'; confirm.className = 'btn btn-primary';
        confirm.style.backgroundColor = '#d6001c';
        confirm.onclick = () => {
            // Collect the selected items grouped by section
            const selectedItems = [];
            scannedSections.forEach(sec => {
                const sectionSelected = [];
                sec.items.forEach((item, idx) => {
                    const chk = allFileCheckboxes.find(c =>
                        parseInt(c.dataset.sectionIndex) === sec.sectionIndex &&
                        parseInt(c.dataset.itemIndex) === idx
                    );
                    if (chk && chk.checked) {
                        sectionSelected.push(item);
                    }
                });
                if (sectionSelected.length > 0) {
                    selectedItems.push({ sectionIndex: sec.sectionIndex, sectionName: sec.sectionName, items: sectionSelected });
                }
            });
            document.body.removeChild(overlay);
            resolve(selectedItems);
        };

        rightBtns.append(cancel, totalCountSpan, confirm);
        footer.append(leftBtns, rightBtns);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}

// --- 6. MAIN DOWNLOAD LOGIC ---

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

        // Pre-scan all sections to get file lists
        btn.innerText = "⏳ Scanning...";
        btn.disabled = true;
        const scannedSections = await preScanSections(sectionsMap);
        btn.innerText = originalText;
        btn.disabled = false;

        const selectedSections = await promptUserForFiles(scannedSections);
        if (!selectedSections || selectedSections.length === 0) return;

        btn.innerText = "⏳ Preparing...";
        btn.disabled = true;

        const zip = new JSZip();
        const courseStructure = [];
        const downloadQueue = [];
        const errorLog = [];
        let totalItemsFound = 0;

        selectedSections.forEach(sec => {
            const sectionName = sec.sectionName;
            const folder = zip.folder(sectionName);
            const usedFilenames = new Set();
            const structEntry = { title: sectionName, files: [], links: [], folders: [] };

            sec.items.forEach(item => {
                const name = getUniqueName(item.name, usedFilenames);

                if (item.type === 'LINK') {
                    structEntry.links.push({ type: 'LINK', name: item.name, url: item.url });
                } else {
                    let targetFolder = folder;
                    // Create a shared ref object so download phase can update the name
                    const fileRef = { name: name };

                    if (item.folderPath) {
                        targetFolder = folder.folder(item.folderPath);
                        let folderStruct = structEntry.folders.find(f => f.name === item.folderPath);
                        if (!folderStruct) {
                            folderStruct = { name: item.folderPath, files: [] };
                            structEntry.folders.push(folderStruct);
                        }
                        folderStruct.files.push(fileRef);
                    } else {
                        structEntry.files.push({ type: 'file', originalName: item.name, finalFileName: name, fileRef });
                    }

                    downloadQueue.push({ type: 'file', folder: targetFolder, url: item.url, originalName: item.name, finalFileName: name, fileRef });
                    totalItemsFound++;
                }
            });

            if (structEntry.files.length > 0 || structEntry.links.length > 0 || structEntry.folders.length > 0) {
                courseStructure.push(structEntry);
            }
        });

        if (totalItemsFound === 0) { alert("No matching content found."); btn.innerText = originalText; btn.disabled = false; return; }

        // --- DOWNLOAD PHASE ---
        btn.innerText = `⏳ Downloading...`;
        
        const fetchPromises = downloadQueue.map(async (item) => {
            try {
                // --- FILE LOGIC (Everything is a direct file now) ---
                const response = await fetch(item.url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('text/html')) throw new Error("Redirected to webpage (Login required?)");

                const blob = await response.blob();
                
                if (!item.finalFileName.includes('.')) {
                    const t = blob.type;
                    if (t.includes('pdf')) item.finalFileName += ".pdf";
                    else if (t.includes('word')) item.finalFileName += ".docx";
                    else if (t.includes('presentation')) item.finalFileName += ".pptx";
                    else if (t.includes('zip')) item.finalFileName += ".zip";
                    else if (t.includes('excel') || t.includes('sheet')) item.finalFileName += ".xlsx";
                    else if (t.includes('image/png')) item.finalFileName += ".png";
                    else if (t.includes('image/jpeg')) item.finalFileName += ".jpg";
                    else if (t.includes('image/gif')) item.finalFileName += ".gif";
                    else if (t.includes('image/svg')) item.finalFileName += ".svg";
                    else if (t.includes('text/plain')) item.finalFileName += ".txt";
                    else if (t.includes('text/csv')) item.finalFileName += ".csv";
                    else if (t.includes('video/mp4')) item.finalFileName += ".mp4";
                    else if (t.includes('audio/mpeg')) item.finalFileName += ".mp3";
                }

                // Sync the final name back to the structure ref so index.html links match
                if (item.fileRef) {
                    item.fileRef.name = item.finalFileName;
                }

                // Base64 Fix
                const base64Data = await blobToBase64(blob);
                item.folder.file(item.finalFileName, base64Data, {base64: true});
            } catch (err) {
                const msg = `FAILED: ${item.originalName || item.folderName} - ${err.message}`;
                console.warn(msg);
                errorLog.push(msg);
                if(item.folder) item.folder.file((item.originalName || "Error") + "_LOG.txt", msg);
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

// 7. Index Generator (Updated for Collapsible Folders)
function generateIndexHtml(zip, structure, title) {
    let totalFiles = 0;
    structure.forEach(s => {
        totalFiles += s.files.length;
        totalFiles += s.links.length;
        // Add files inside folders to count
        s.folders.forEach(f => totalFiles += f.files.length);
    });

    const styles = `body{font-family:'Segoe UI',sans-serif;background:#f4f6f8;color:#333;margin:0}.container{max-width:900px;margin:40px auto;padding:20px}.header{background:white;padding:30px;border-radius:12px;border-top:5px solid #d6001c;text-align:center;box-shadow:0 4px 10px rgba(0,0,0,0.05)}.search{width:100%;padding:12px;border:2px solid #eee;border-radius:25px;margin-top:15px;outline:none}.section{background:white;border-radius:8px;margin-top:20px;overflow:hidden}.s-head{background:#2c3e50;color:white;padding:12px 20px;font-weight:600}ul{list-style:none;padding:0;margin:0}li{padding:12px 20px;border-bottom:1px solid #f9f9f9;display:flex;align-items:center}a{text-decoration:none;color:#333;flex:1}.badge{font-size:0.7em;padding:3px 8px;border-radius:4px;margin-right:10px;color:white;min-width:50px;text-align:center;font-weight:bold}.b-file{background:#3498db}.b-folder{background:#f39c12}.b-link{background:#9b59b6}.b-err{background:#e74c3c}.hidden{display:none!important}
    /* New Styles for Details/Summary */
    details { width: 100%; }
    summary { cursor: pointer; display: flex; align-items: center; outline: none; }
    summary:hover { color: #d6001c; }
    details ul { margin-top: 5px; border-left: 3px solid #eee; margin-left: 20px; padding-left: 10px; }
    details ul li { border-bottom: none; padding: 6px 10px; font-size: 0.95em; }
    `;

    const script = `function filter(){const v=document.getElementById('s').value.toLowerCase();document.querySelectorAll('.section').forEach(s=>{let m=false;s.querySelectorAll('li').forEach(l=>{const t=l.innerText.toLowerCase();if(t.includes(v)){l.classList.remove('hidden');m=true}else l.classList.add('hidden')});const ti=s.querySelector('.s-head').innerText.toLowerCase();if(ti.includes(v)||m){s.classList.remove('hidden');if(ti.includes(v))s.querySelectorAll('li').forEach(l=>l.classList.remove('hidden'))}else s.classList.add('hidden')})}`;

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${styles}</style></head><body><div class="container"><div class="header"><h1>${title}</h1><p>${structure.length} Weeks • ${totalFiles} Items</p><input type="text" id="s" class="search" onkeyup="filter()" placeholder="🔍 Search..."></div>`;

    structure.forEach(sec => {
        html += `<div class="section"><div class="s-head">${sec.title}</div><ul>`;

        // 1. Files
        sec.files.forEach(f => {
            // Use the updated name from the fileRef (which has the extension added during download)
            const displayFileName = f.fileRef ? f.fileRef.name : f.finalFileName;
            if (f.error) html += `<li><span class="badge b-err">ERR</span>${f.originalName} (See Log)</li>`;
            else html += `<li><span class="badge ${f.isLocalPage ? 'b-page' : 'b-file'}">${f.isLocalPage ? 'PAGE' : 'FILE'}</span><a href="${encodeURIComponent(sec.title)}/${encodeURIComponent(displayFileName)}" target="_blank">${f.originalName}</a></li>`;
        });

        // 2. Folders (New Collapsible Logic)
        if (sec.folders && sec.folders.length > 0) {
            sec.folders.forEach(dir => {
                html += `<li>
                    <details>
                        <summary>
                            <span class="badge b-folder">DIR</span> ${dir.name}
                        </summary>
                        <ul>`;

                if (dir.files.length === 0) {
                    html += `<li style="color:#aaa;">Empty folder</li>`;
                } else {
                    dir.files.forEach(fileEntry => {
                        // fileEntry is now a ref object { name: '...' } with the final name including extension
                        const fName = typeof fileEntry === 'object' ? fileEntry.name : fileEntry;
                        const path = `${encodeURIComponent(sec.title)}/${encodeURIComponent(dir.name)}/${encodeURIComponent(fName)}`;
                        html += `<li><span class="badge b-file" style="transform:scale(0.85)">FILE</span><a href="${path}" target="_blank">${fName}</a></li>`;
                    });
                }
                html += `</ul></details></li>`;
            });
        }

        // 3. Links
        sec.links.forEach(l => {
            html += `<li><span class="badge b-link">LINK</span><a href="${l.url}" target="_blank">${l.name} ↗</a></li>`;
        });

        html += `</ul></div>`;
    });

    html += `</div><script>${script}</script></body></html>`;
    zip.file("index.html", html);
}

// 8. Grade Export
async function exportGrades() {
    const btn = this; const orig = btn.innerText; btn.innerText = "Fetching...";
    try {
        const id = new URLSearchParams(window.location.search).get('id');
        const origin = window.location.origin;
        const r = await fetch(`${origin}/grade/report/user/index.php?id=${id}`);
        if (!r.ok) throw new Error("Grade page not found");
        const t = await r.text();
        const doc = new DOMParser().parseFromString(t, "text/html");

        let csv = "Item,Grade,Range,Percentage,Feedback\n";
        const rows = doc.querySelectorAll('table.user-grade tbody tr, table.generaltable tbody tr');

        rows.forEach(row => {
            const c = Array.from(row.querySelectorAll('td,th')).map(x => x.innerText.replace(/,/g, " ").trim());
            if (c.length > 2) csv += c.slice(0, 5).join(",") + "\n";
        });

        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = `Grades_${id}.csv`; a.click(); btn.innerText = "✅ Done";
    } catch (e) { console.error(e); alert("Could not fetch grades."); btn.innerText = "❌ Error"; }
    setTimeout(() => btn.innerText = orig, 2000);
}

// Init
window.addEventListener('load', addDownloadButton);
if (document.readyState === 'complete') addDownloadButton();