import { DEFAULTS } from "./sessions.js";

const form = document.getElementById("settings");
const frame = document.getElementById("portal");
const settingsBtn = document.getElementById("toggle-settings");
const welcome = document.getElementById("welcome");
let portalUrl;

function showSettings(on) {
  form.hidden = !on;
  frame.hidden = on;
  settingsBtn.setAttribute("aria-pressed", on);
}

function load(s) {
  form.prefix.value = s.prefix;
  form.region.value = s.region;
  welcome.hidden = !!s.prefix;
  if (!s.prefix) return showSettings(true); // first open: ask for the portal prefix
  portalUrl = `https://${s.prefix}.awsapps.com/start/#/`;
  frame.src = portalUrl;
  showSettings(false);
}

settingsBtn.onclick = () => showSettings(form.hidden);
document.getElementById("reload").onclick = () => { if (portalUrl) frame.src = portalUrl; };
document.getElementById("popout").onclick = () => { if (portalUrl) chrome.tabs.create({ url: portalUrl }); };

form.onsubmit = async e => {
  e.preventDefault();
  const s = { prefix: form.prefix.value.trim().toLowerCase(), region: form.region.value.trim() };
  await chrome.storage.sync.set(s);
  load(s);
};

chrome.storage.sync.get(DEFAULTS).then(load);

// Shortcut pressed while this panel is open (see background.js). Ignored right after loading,
// when this panel is the one the same key press just opened.
chrome.windows.getCurrent().then(({ id }) => chrome.runtime.onMessage.addListener(m => {
  if (m.closePanel === id && performance.now() > 1000) window.close();
}));
