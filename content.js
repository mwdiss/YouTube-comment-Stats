// Time Shortener (5 hours ago -> 5 hrs ago)
function makeTimeShort(text) {
    if(!text) return "";
    return text
        .replace(/ seconds? ago/, "s ago")
        .replace(/ minutes? ago/, "m ago")
        .replace(/ hours? ago/, " hrs ago")
        .replace(/ days? ago/, " dys ago")
        .replace(/ weeks? ago/, " wks ago")
        .replace(/ months? ago/, " mths ago")
        .replace(/ years? ago/, " yrs ago")
        .replace(" (edited)", " (ed)");
}

const visibilityObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            loadStats(entry.target);
            observer.unobserve(entry.target);
        }
    });
}, { rootMargin: "200px" });

// Observer for Navigation (SPA video changes)
const linkObserver = new MutationObserver((mutations) => {
    mutations.forEach(m => {
        if (m.type === 'attributes' && m.attributeName === 'href') {
             const container = m.target.closest('#header-author');
             if(!container) return;
             
             // Reset state so it re-runs
             container.removeAttribute('data-loaded'); 
             const wrapper = container.closest('ytd-comment-view-model') || container.closest('ytd-comment-renderer');
             if(wrapper) loadStats(wrapper, true); 
        }
    });
});

function processComments() {
    const headers = document.querySelectorAll('#header-author');
    headers.forEach(header => {
        const commentRoot = header.closest('ytd-comment-view-model') || header.closest('ytd-comment-renderer');
        
        // Prevent dupes
        if (!commentRoot || commentRoot.getAttribute('data-v100-active')) return;
        commentRoot.setAttribute('data-v100-active', 'true');

        // FORCE Layout (Single line, wrap if needed)
        header.classList.add('yt-stat-header-layout');

        // Watch for href changes (user navigates to new video)
        const authLink = header.querySelector('a#author-text');
        if(authLink) {
            linkObserver.observe(authLink, { attributes: true });
        }
        
        visibilityObserver.observe(commentRoot);
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

    // 1. Immediate Time Shortening
    if(timeLink.innerText.includes("ago")) {
         timeLink.innerText = makeTimeShort(timeLink.innerText);
    }
    
    // Parse URL for handle (Keep original Case)
    const cleanUrl = authorLink.href.split('?')[0];
    const urlHandle = cleanUrl.split('@')[1] || ""; // Gets "KalEmberTTV" exact

    chrome.runtime.sendMessage({ action: "getStats", url: cleanUrl }, (data) => {
        if (!data || data.error) return;

        // Clean previous injections
        header.querySelectorAll('.yt-ext-injected').forEach(el => el.remove());
        header.setAttribute('data-loaded', 'true');

        // --- 1. USERNAME BLOCK ---
        const displayName = data.displayName || "";
        let finalNameHtml = displayName;

        // If Handle exists and is different from name (insensitive check), show both
        // OR if display name is empty, just show handle
        if (urlHandle && displayName && displayName.toLowerCase() !== urlHandle.toLowerCase()) {
             // White Name • Gray Handle
             finalNameHtml = `${displayName} <span class="yt-gray-text"> • @${urlHandle}</span>`;
        } else if (!displayName) {
             finalNameHtml = `@${urlHandle}`;
        } else if (displayName && !urlHandle) {
             finalNameHtml = displayName;
        }

        const nameSpan = authorLink.querySelector('span');
        if (nameSpan) nameSpan.innerHTML = finalNameHtml;

        // --- 2. SEPARATOR (Dot before time) ---
        const sep = document.createElement('span');
        sep.className = 'yt-ext-injected yt-gray-text';
        sep.textContent = " • "; 
        header.insertBefore(sep, timeElement);

        // --- 3. STATS (Dot Join Dot Subs) ---
        const stats = document.createElement('span');
        stats.className = 'yt-ext-injected yt-gray-text';
        // Note: Spaces included in string for spacing
        stats.textContent = ` • ${data.joined} • ${data.subs}`;
        header.appendChild(stats);
    });
}

processComments();
const domObserver = new MutationObserver((mutations) => {
    if(mutations.some(m => m.addedNodes.length > 0)) processComments();
});
domObserver.observe(document.body, { childList: true, subtree: true });