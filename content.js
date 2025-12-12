/* =========================================================================
   PART 1: COMMENT SWAP LOGIC
   ========================================================================= */

const LAYOUT_KEY = "yt_ext_nomad_mode";

function runLayoutLogic() {
    const savedMode = localStorage.getItem(LAYOUT_KEY) || 'bottom';
    
    const comments = document.querySelector('#comments');
    const secondaryCol = document.querySelector('#secondary');
    const relatedInner = document.querySelector('#secondary-inner');
    const primaryCol = document.querySelector('#primary');
    const belowCol = document.querySelector('#below');

    if (!comments || !secondaryCol || !relatedInner || !primaryCol) return;

    if (savedMode === 'right') {
        document.body.classList.add('nomad-active');
        
        if (!secondaryCol.contains(comments)) {
            secondaryCol.appendChild(comments);
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
    // 1. Target the Menu Parent (This holds the like buttons AND the ... button)
    // We try to be specific to the video metadata section
    const menuRenderer = document.querySelector('ytd-watch-metadata #menu ytd-menu-renderer') || 
                         document.querySelector('ytd-menu-renderer'); // fallback
    
    if (!menuRenderer) return;

    // Check if we already exist
    if (document.querySelector('#yt-nomad-btn')) return;

    // 2. Build Button
    const btnContainer = document.createElement('div');
    btnContainer.id = 'yt-nomad-btn';
    btnContainer.style.display = 'inline-flex';
    btnContainer.style.alignItems = 'center';
    btnContainer.style.marginLeft = '8px';
    btnContainer.style.cursor = 'pointer';

    const btn = document.createElement('button');
    btn.innerText = "Comnt \u{3009}"; 
    
    // Style matches YT Tonal Button
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

    // 3. PLACEMENT LOGIC: Right side of "..."
    // According to your HTML, the "..." button is <yt-button-shape id="button-shape">
    
    const dotsButton = menuRenderer.querySelector('#button-shape');
    
    if (dotsButton) {
        // We insert the container AFTER the dots button
        if (dotsButton.nextSibling) {
             menuRenderer.insertBefore(btnContainer, dotsButton.nextSibling);
        } else {
             menuRenderer.appendChild(btnContainer);
        }
    } else {
        // Fallback: If "..." isn't rendered yet or differs, just append to main container
        menuRenderer.appendChild(btnContainer);
    }
}

// Watch DOM for redrawing (navigating videos)
const nomadObserver = new MutationObserver(() => {
    injectLayoutButton();
    runLayoutLogic();
});
nomadObserver.observe(document.body, { childList: true, subtree: true });


/* =========================================================================
   PART 2: STATS LOGIC
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
    const headers = document.querySelectorAll('#header-author');
    headers.forEach(header => {
        const root = header.closest('ytd-comment-view-model') || header.closest('ytd-comment-renderer');
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

const contentObserver = new MutationObserver((mutations) => {
    if(mutations.some(m => m.addedNodes.length > 0)) processComments();
});
contentObserver.observe(document.body, { childList: true, subtree: true });

processComments();