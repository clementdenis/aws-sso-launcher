// Inside the side panel the portal is a cross-site frame, where the browser silently drops
// SameSite=Lax/Strict cookies written by script — including the portal's loginCsrfToken,
// which makes /auth/sso-token return 401 (blank portal). Rewrite them as SameSite=None.
// Only when framed: the portal in a normal tab is left untouched.
if (window !== window.top) {
  const { get, set } = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
  Object.defineProperty(Document.prototype, "cookie", {
    configurable: true,
    get() { return get.call(this); },
    set(value) {
      let v = value.replace(/;\s*samesite=[^;]*/i, "") + "; SameSite=None";
      if (!/;\s*secure\b/i.test(v)) v += "; Secure"; // SameSite=None requires Secure
      set.call(this, v);
    }
  });
}
