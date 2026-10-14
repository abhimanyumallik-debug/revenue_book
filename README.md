# Fynd revenue portal

The FY27 revenue book as a live web page. Each CXO signs in with their Fynd Google account and sees their own book. Founders and S&C see all CXOs. Numbers are read from **MIS for Monthly Report FY27** at request time, cached 5 minutes.

## How it fits together

| Piece | Where it runs | Holds data? | Job |
|---|---|---|---|
| `web/` | GitHub Pages | No | Google sign-in, renders the book |
| `apps-script/` | Google Apps Script, as the sheet owner | Reads the sheet | Verifies the sign-in, checks the access list, computes the book, returns only what that person may see |
| `Portal Access` tab | In the MIS sheet | Emails and roles | Who sees what |

```
Browser (GitHub Pages) --ID token--> Apps Script web app --reads--> MIS sheet
                       <--that CXO's book only--
```

Access is enforced in Apps Script, not in the browser. A CXO's response never contains another CXO's numbers, JCP, other income or sheet diagnostics. The browser cannot widen it. Tests in `test/` check this.

## Security model

- The GitHub Pages site is public static code. It holds no revenue numbers. Keep the repo private anyway.
- The Apps Script URL is reachable by anyone, but it returns data only for a valid Google ID token issued to this portal's OAuth client, from an `@gofynd.com` account, whose email is on the `Portal Access` tab.
- CXOs do not need access to the MIS sheet. The script reads it as the deploying account.
- Create a tab named `Portal Log` to record every read (time, email, what was served).
- Do not commit exports, screenshots or fixtures with real numbers. `?demo=admin` uses random sample data.

## Setup (about 30 minutes, once)

**1. OAuth client (Google Cloud console, Fynd org project)**
- APIs & Services > OAuth consent screen > User type **Internal**.
- Credentials > Create OAuth client ID > **Web application**.
- Authorised JavaScript origins: `https://<org>.github.io` (and a custom domain if used).
- Copy the client ID.

**2. Apps Script**
- From the MIS sheet: Extensions > Apps Script. Or a standalone project via `clasp`.
- Add `Config.gs`, `Report.gs`, `Code.gs`, and replace `appsscript.json` (Project Settings > show manifest).
- In `Config.gs` set `OAUTH_CLIENT_ID`.
- Project Settings > Script properties: `ADMINS` = `abhimanyumallik@gofynd.com,...` (bootstrap admins).
- Run `setupCheck` once from the editor. Approve the scopes. Read the log: tab list, missing columns, warnings.
- Deploy > New deployment > Web app. Execute as **Me**. Who has access **Anyone**. Copy the `/exec` URL.

**3. Access list**
Add a tab `Portal Access` to the MIS sheet:

| Email | Role | CXO |
|---|---|---|
| ragini@gofynd.com | cxo | Ragini |
| farooq@gofynd.com | admin | |

`Role` is `admin` (all CXOs) or `cxo` (that CXO only). The CXO name must match `CONFIG.CXOS`. Changes apply within 60 seconds.

**4. GitHub**
- Create a private repo, push this folder.
- Settings > Pages > Source: **GitHub Actions**. Private-repo Pages needs a paid GitHub plan.
- Edit `web/config.js`: `API_URL` = the `/exec` URL, `CLIENT_ID` = the OAuth client ID.
- Push to `main`. The workflow runs the tests, then publishes `web/`.

## Mapping the MIS sheet

`Config.gs` names the tabs and columns the book reads. Header matching ignores case, spaces and punctuation and accepts aliases. Defaults follow the v0.7 revenue book footnotes:

| Book section | Tab | Columns |
|---|---|---|
| Target | `Summary` | CXO, AOP/ Target |
| Billed / received | `Revenue Billed YTD` | CXO, Invoice Month, Amount, Amount Received, Revenue Type |
| Projections, beyond FY27 | one tab per CXO | Customer Name, IP, Revenue Type, Order form status, Customer Status, Live, Invoiced Revenue (YTD), Total Order Form Value, Estimated TCV, Expected Oct to Mar |
| September check, phasing | `Commitment` (optional) | CXO, Sep, Oct to Mar |

If the MIS layout differs, the admin view shows "Sheet checks" listing what did not match. Fix the names in `Config.gs` and redeploy (Deploy > Manage deployments > edit > new version; the URL stays the same).

`UNIT_DIVISOR` is `1e7` (sheet in Rs, page in Rs Cr). Set to `1` if the sheet is already in Cr.

## Rules carried over from v0.7

- Inter-company deposit rows are dropped from billed.
- Other Income rows sit on their own line, outside totals and the target comparison. Admin view only.
- OF Signed: order form Signed, or Live, or Invoiced Revenue (YTD) > 0. Commercials Sent: OF sent for signing / Commercial Sent, or Customer Status Proposal Sent with order form blank. Churned, Expired, Dropped are left out.
- Signed lines spread evenly October to March. Unsigned lines follow the owner's commitment months where the `Commitment` tab exists, else evenly.
- Beyond FY27 = order form value (Estimated TCV if blank) − invoiced YTD − expected October to March. Zero or negative lines are left out.
- JCP is shown on its own line, billed only, admin view only.

## Limits

- Apps Script allows about 30 simultaneous requests and 6 minutes per run. Fine for the Revenue Council. The 5-minute cache keeps the sheet from being read on every open.
- "Refresh" bypasses the cache for admins only.
- ID tokens last one hour. After that the page asks to sign in again.

## Local checks

```
node test/report.test.js            # report rules and per-CXO filtering
cd web && python3 -m http.server    # open http://localhost:8000/?demo=admin  or ?demo=cxo
```
