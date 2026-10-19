// Clipboard writer for the service worker (see copyText in background.js).
chrome.runtime.onMessage.addListener(({ copy }, _sender, reply) => {
  if (copy === undefined) return;
  const area = document.querySelector("textarea");
  area.value = copy;
  area.select();
  reply(document.execCommand("copy"));
});
