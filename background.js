const memoryCache = new Map();

function timeAgo(dateString) {
  if(!dateString) return "";
  const joined = new Date(dateString);
  const now = new Date();
  const diff = now - joined;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years >= 1) return `${years}yrs`;
  if (months >= 1) return `${months}mths`;
  return `${days}dys`;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getStats") {
    let channelUrl = request.url;
    if (channelUrl.startsWith('http://')) channelUrl = channelUrl.replace('http://', 'https://');
    
    if (memoryCache.has(channelUrl)) {
      sendResponse(memoryCache.get(channelUrl));
      return true;
    }

    const fetchUrl = channelUrl.endsWith('/about') ? channelUrl : `${channelUrl}/about`;

    fetch(fetchUrl)
      .then(r => r.text())
      .then(text => {
        const result = { displayName: null, joined: "?", subs: "Hidden" };

        const titleMatch = text.match(/<title>(.*?) - YouTube<\/title>/);
        if (titleMatch) result.displayName = titleMatch[1];

        const dateMatch = text.match(/Joined ([A-Z][a-z]+ \d{1,2}, \d{4})/);
        if (dateMatch) result.joined = timeAgo(dateMatch[1]);

        const specificMatch = text.match(/"subscriberCountText":"([^"]+)"/);
        if (specificMatch && specificMatch[1]) {
             result.subs = specificMatch[1].replace(/ subscribers?/i, "").trim();
        } else {
             const fallbackMatch = text.match(/"subscriberCountText".*?"simpleText":"(.*?)"/);
             if (fallbackMatch && fallbackMatch[1]) {
                 result.subs = fallbackMatch[1].replace(/ subscribers?/i, "").trim();
             } else {
                 const complexMatch = text.match(/"subscriberCountText":\{.*?"text":"(\d+(?:\.\d+)?[KMB]?)"/);
                 if(complexMatch) result.subs = complexMatch[1];
             }
        }
        memoryCache.set(channelUrl, result);
        sendResponse(result);
      })
      .catch(() => sendResponse({ error: true }));
    return true; 
  }
});