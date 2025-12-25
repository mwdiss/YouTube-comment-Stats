/* =========================================================================
   YOUTUBE PRO: CONTENT SCRIPT (VERSION 14.0 - SHORTS SUPPORT)
   ========================================================================= */

/* --- CONFIG & STATE --- */
const LAYOUT_KEY = "yt_ext_nomad_mode";
let interactionTimer = null; 

// HELPERS: Distinct checks for page type
function isStandardVideo() {
    return window.location.pathname === '/watch';
}

function isShorts() {
    return window.location.pathname.startsWith('/shorts/');
}

function isAnyVideoContext() {
    return isStandardVideo() || isShorts();
}

/* =========================================================================
   PART 1: COMMENT SWAP LOGIC ("Comnt >") 
   [Enabled ONLY for Standard Videos]
   ========================================================================= */

function runLayoutLogic() {
    if (!isStandardVideo()) return; // Disable on Shorts

    const savedMode = localStorage.getItem(LAYOUT_KEY) || 'bottom';
    
    const comments = document.querySelector('#comments');
    const secondaryCol = document.querySelector('#secondary');
    const relatedInner = document.querySelector('#secondary-inner') || document.querySelector('#related');
    const primaryCol = document.querySelector('#primary');
    const belowCol = document.querySelector('#below');

    if (!comments || !secondaryCol || !relatedInner || !primaryCol) return;

    if (savedMode === 'right') {
        document.body.classList.add('nomad-active');
        if (!secondaryCol.contains(comments)) {
            secondaryCol.insertBefore(comments, secondaryCol.firstChild);
        }
        if (!primaryCol.contains(relatedInner)) {
            primaryCol.appendChild(relatedInner);
        }
    } else {
        document.body.classList.remove('nomad-active');
        if (!secondaryCol.contains(relatedInner)) {
            secondaryCol.appendChild(relatedInner);
        }
        if (belowCol && !belowCol.contains(comments)) {
            belowCol.appendChild(comments);
        }
    }
}

function toggleLayout() {
    const current = localStorage.getItem(LAYOUT_KEY) || 'bottom';
    const next = current === 'bottom' ? 'right' : 'bottom';
    localStorage.setItem(LAYOUT_KEY, next);
    runLayoutLogic();
}

function injectLayoutButton() {
    if (!isStandardVideo()) return; // No swap button on Shorts

    const menuRenderer = document.querySelector('ytd-watch-metadata #menu ytd-menu-renderer') || 
                         document.querySelector('ytd-menu-renderer');
    
    if (!menuRenderer) return;
    if (document.querySelector('#yt-nomad-btn')) return;

    // CONTAINER
    const btnContainer = document.createElement('div');
    btnContainer.id = 'yt-nomad-btn';
    btnContainer.style.display = 'inline-flex';
    btnContainer.style.alignItems = 'center';
    btnContainer.style.marginLeft = '8px';
    btnContainer.style.cursor = 'pointer';

    // BUTTON
    const btn = document.createElement('button');
    btn.innerText = "Comnt \u{3009}"; 
    btn.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m';
    btn.style.background = 'rgba(255,255,255,0.1)';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '18px';
    btn.style.height = '36px';
    btn.style.padding = '0 12px';
    btn.style.fontWeight = '500';
    btn.style.fontSize = '14px';
    btn.style.cursor = 'pointer';
    btn.style.fontFamily = 'Roboto, sans-serif';

    btn.onclick = toggleLayout;
    btnContainer.appendChild(btn);

    // PLACEMENT: Right of "..."
    const dotsButton = menuRenderer.querySelector('#button-shape');
    if (dotsButton) {
        if (dotsButton.nextSibling) {
             menuRenderer.insertBefore(btnContainer, dotsButton.nextSibling);
        } else {
             menuRenderer.appendChild(btnContainer);
        }
    } else {
        menuRenderer.appendChild(btnContainer);
    }
}

/* =========================================================================
   PART 2: STATS LOGIC
   [Enabled for BOTH Standard Videos and Shorts]
   ========================================================================= */

function makeTimeShort(text) {
    if(!text) return "";
    return text.replace(/ seconds? ago/, "s ago")
        .replace(/ minutes? ago/, "m ago")
        .replace(/ hours? ago/, " hrs ago")
        .replace(/ days? ago/, " dys ago")
        .replace(/ weeks? ago/, " wks ago")
        .replace(/ months? ago/, " mths ago")
        .replace(/ years? ago/, " yrs ago")
        .replace(" (edited)", " (ed)");
}

const statsObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            loadStats(entry.target);
            observer.unobserve(entry.target);
        }
    });
}, { rootMargin: "200px" });

const linkObserver = new MutationObserver((mutations) => {
    mutations.forEach(m => {
        if (m.type === 'attributes' && m.attributeName === 'href') {
             const container = m.target.closest('#header-author');
             if(!container) return;
             container.removeAttribute('data-loaded'); 
             const wrapper = container.closest('ytd-comment-view-model') || container.closest('ytd-comment-renderer');
             if(wrapper) loadStats(wrapper, true); 
        }
    });
});

function processComments() {
    // RUNS ON BOTH SHORTS AND VIDEO
    const headers = document.querySelectorAll('#header-author');
    
    headers.forEach(header => {
        const root = header.closest('ytd-comment-view-model') || header.closest('ytd-comment-renderer');
        
        // Skip if already active
        if (!root || root.getAttribute('data-v10-active')) return;
        root.setAttribute('data-v10-active', 'true');

        header.classList.add('yt-stat-header-layout');

        const authLink = header.querySelector('a#author-text');
        if(authLink) linkObserver.observe(authLink, { attributes: true });
        
        statsObserver.observe(root);
    });
}

function loadStats(commentRoot, force = false) {
    const header = commentRoot.querySelector('#header-author');
    if(!header) return;
    if (!force && header.getAttribute('data-loaded')) return;

    const authorLink = header.querySelector('a#author-text');
    const timeElement = header.querySelector('#published-time-text');
    const timeLink = timeElement ? timeElement.querySelector('a') : null;

    if (!authorLink || !timeLink) return;

    if(timeLink.innerText.includes("ago")) timeLink.innerText = makeTimeShort(timeLink.innerText);

    const cleanUrl = authorLink.href.split('?')[0];
    const urlHandle = cleanUrl.split('@')[1] || "";

    chrome.runtime.sendMessage({ action: "getStats", url: cleanUrl }, (data) => {
        if (!data || data.error) return;

        header.querySelectorAll('.yt-ext-node').forEach(el => el.remove());
        header.setAttribute('data-loaded', 'true');

        const displayName = data.displayName || "";
        let finalNameHtml = displayName;

        if (urlHandle && displayName && displayName.toLowerCase() !== urlHandle.toLowerCase()) {
             finalNameHtml = `${displayName} <span class="yt-gray-text"> • @${urlHandle}</span>`;
        } else if (!displayName) {
             finalNameHtml = `@${urlHandle}`;
        } else if (displayName && !urlHandle) {
             finalNameHtml = displayName;
        }

        const nameSpan = authorLink.querySelector('span');
        if (nameSpan) nameSpan.innerHTML = finalNameHtml;

        const sep = document.createElement('span');
        sep.className = 'yt-ext-node yt-gray-text';
        sep.textContent = " • "; 
        header.insertBefore(sep, timeElement);

        const stats = document.createElement('span');
        stats.className = 'yt-ext-node yt-gray-text';
        stats.textContent = ` • ${data.joined} • ${data.subs}`;
        header.appendChild(stats);
    });
}


/* =========================================================================
   PART 3: LIFECYCLE (The Manager)
   ========================================================================= */

function checkDOM() {
    // 1. Swap Button (Standard Video Only)
    if (isStandardVideo()) {
        injectLayoutButton();
        runLayoutLogic();
    }
    
    // 2. Stats (Any Video Type including Shorts)
    if (isAnyVideoContext()) {
        processComments();
    }
}

// 1. Observer: Detects dynamic loading (AJAX navigation / comments opening)
const globalObserver = new MutationObserver((mutations) => {
    if (mutations.some(m => m.addedNodes.length > 0)) {
        checkDOM();
    }
});
globalObserver.observe(document.body, { childList: true, subtree: true });

// 2. YouTube Event: Navigate Finish (Home -> Video)
document.addEventListener("yt-navigate-finish", function() {
    checkDOM();
    runSmartInterval(); 
});

// 3. Fallback Interval (Catches late loaders)
function runSmartInterval() {
    if(interactionTimer) clearInterval(interactionTimer);
    
    let attempts = 0;
    interactionTimer = setInterval(() => {
        checkDOM();
        attempts++;
        if(attempts > 10) clearInterval(interactionTimer);
    }, 500);
}

runSmartInterval();