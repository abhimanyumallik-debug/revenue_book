# Fynd finance portal

Billing, collections, CXO P&L and order forms on one page, read live from **MIS for Monthly Report FY27**. Each CXO signs in with their Fynd Google account and sees their own numbers. Founders and S&C see everything. Figures in Rs Cr, cached 5 minutes.

## What it shows

| Page | Source tab | Content |
|---|---|---|
| Overview | Revenue Data, CXO P/L | Billed FY27 YTD, growth on FY26 same months, collected %, outstanding, latest-month EBITDA, monthly FY27 vs FY26 chart, table by CXO |
| Revenue | Revenue Data | Billed and collected by CXO and month, FY26 same months, other income and inter-company rows left out (admin) |
| Mix | Revenue Data | Billed by frequency (MRR/QRR/ARR/Variable/Onetime/Resource), BU, IP, region, new vs existing, billing entity; revenue type for admins |
| Customers | Revenue Data | Top 50 customers per CXO, billed, collected, collection %, search |
| P&L | CXO P/L | One month across CXOs, or one CXO across months with FY27 YTD |
| Order forms | Order Form | FY27 signed count, value, annualised value by CXO and quarter, latest 25 |
| Checks (admin) | Billed Collected summary | Portal billed vs the sheet's own summary, unmatched CXOs, missing columns |

## How it fits together

| Piece | Runs on | Holds data? | Job |
|---|---|---|---|
| `web/` | GitHub Pages | No | Google sign-in, renders the pages |
| `apps-script/` | Google Apps Script, as an account that can read the MIS | Reads the sheet | Verifies sign-in, checks the access list, builds the book, returns only that viewer's slice |
| `Portal Access` tab | In the MIS sheet | Emails and roles | Who sees what |

```
Browser (GitHub Pages) --Google ID token--> Apps Script web app --reads--> MIS sheet
                       <--that CXO's slice only--
```

Access is cut on the server. A CXO response carries no other CXO's revenue, customers, P&L column or order forms, no JCP, no other income, no reconciliation. Tests in `test/` check each of these.

## Security

- Pages hosts code only, no numbers. Keep the repo private anyway.
- The Apps Script URL answers only a valid Google ID token issued to this portal's OAuth client, from `@gofynd.com`, whose email is on `Portal Access`.
- CXOs do not need access to the MIS sheet.
- Add a `Portal Log` tab to record every read (time, email, slice served).
- Never commit exports or screenshots with real numbers. `.gitignore` blocks `.xlsx`, `.csv`, `.pdf`. `?demo=admin` uses random sample data.

## Setup (once, about 30 minutes)

**1. OAuth client** (Google Cloud console, a Fynd org project)
- OAuth consent screen: User type **Internal**.
- Credentials > Create OAuth client ID > **Web application**.
- Authorised JavaScript origins: `https://<org>.github.io` (plus any custom domain).
- Copy the client ID.

**2. Apps Script**
- New project at script.google.com, signed in as an account that can read the MIS.
- Add `Config.gs`, `Report.gs`, `Code.gs`. Replace `appsscript.json` (Project Settings > show manifest).
- `Config.gs`: set `OAUTH_CLIENT_ID`.
- Project Settings > Script properties: `ADMINS` = comma-separated admin emails.
- Run `setupCheck` once. Approve scopes. The log shows months found, P&L months, reconciliation and warnings.
- Deploy > New deployment > Web app. Execute as **Me**. Who has access **Anyone**. Copy the `/exec` URL.

**3. Access list.** Add a tab `Portal Access` to the MIS:

| Email | Role | CXO |
|---|---|---|
| ragini@gofynd.com | cxo | Ragini |
| ronak@gofynd.com | cxo | Ronak |
| farooq@gofynd.com | admin | |

`admin` sees all CXOs. `cxo` sees the CXOs in the third column; list several with commas (`Ronak, Dharmendra`). Names must match `CONFIG.CXOS`; `Dharam` maps to Dharmendra. Changes apply within 60 seconds.

**4. GitHub**
- Private repo, push this folder.
- Settings > Pages > Source: **GitHub Actions**. Pages on a private repo needs a paid plan.
- `web/config.js`: `API_URL` = the `/exec` URL, `CLIENT_ID` = the OAuth client ID.
- Push to `main`. The workflow runs the tests, then publishes `web/`.

## Rules

- **Billed** = `Revenue_Netof_Tax`, credit notes netted, by `Month_YY`, for `Financial_Year` FY2026-27.
- **Same period last year** = FY2025-26 rows for the same months. A month still in progress is shown as MTD and left out of growth.
- **Collected** = `Receipt Amount` on invoices raised in that month.
- **Outstanding** = `Outstanding` on open invoices from FY26 and FY27.
- **Left out of revenue**: `Revenue_Type` matching `inter-company` or `deposit` (dropped, as in the v0.7 revenue book); `Other Income` (own line, admin only). Patterns in `Config.gs`.
- **JCP** sits on its own line, outside "Total excluding JCP", and out of the mix so it does not swamp the other CXOs.
- **P&L** = each month block on `CXO P/L` (header row: month in column A, CXO names across). Helper columns like `Ragini + Ronak` are ignored. YTD adds the FY27 months present.
- **Order forms** = rows on `Order Form` whose `QTR` is in FY27.

## When the MIS changes

Tab and column names live in `apps-script/Config.gs`, matched loosely with aliases. If Muskan renames a column, the Checks page lists what no longer matches. Fix `Config.gs`, then Deploy > Manage deployments > edit > New version. The URL stays the same.

## Not in v1

AOP targets, October to March projections and revenue beyond FY27 come from the Revenue Data Consolidation sheet, not the MIS. Add that sheet's ID to `Config.gs` and a fourth builder in `Report.gs` to bring the v0.7 projection pages in.

## Limits

- Apps Script: about 30 simultaneous requests, 6 minutes per run. The 5-minute cache keeps the 10,000-row Revenue Data tab from being read on every open.
- Refresh bypasses the cache for admins only.
- Google ID tokens last one hour; then the page asks to sign in again.

## Local checks

```
node test/report.test.js            # 21 checks: rules, parsing, per-CXO cut
cd web && python3 -m http.server    # http://localhost:8000/?demo=admin  or ?demo=cxo
```
