// Public settings for the portal front end. No secrets belong here:
// this file is served from GitHub Pages and anyone can read it.
window.PORTAL_CONFIG = {
  // Apps Script web app URL (Deploy > Manage deployments > Web app URL)
  API_URL: 'https://script.google.com/macros/s/REPLACE_ME/exec',

  // OAuth Web client ID (must match CONFIG.OAUTH_CLIENT_ID in apps-script/Config.gs)
  CLIENT_ID: 'REPLACE_ME.apps.googleusercontent.com',

  // Google Workspace domain shown on the sign-in prompt
  DOMAIN: 'gofynd.com',

  TITLE: 'FY27 revenue book'
};
