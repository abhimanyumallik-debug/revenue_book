/**
 * Fynd Revenue Portal — configuration.
 *
 * Everything that depends on the layout of "MIS for Monthly Report FY27"
 * lives here. If a tab or column is renamed in the sheet, change it here
 * and redeploy. Run `?action=schema` as an admin to see what matched.
 *
 * Header names are matched loosely: case, spaces and punctuation are ignored,
 * and each field accepts a list of aliases.
 */

var CONFIG = {
  // Source sheet: MIS for Monthly Report FY27
  SPREADSHEET_ID: '15gEZfqdeT1A9MPrK_DMfCPTLk59rmc_4dubmttWh7DI',

  // OAuth Web client ID from Google Cloud console (same value goes in web/config.js)
  OAUTH_CLIENT_ID: 'REPLACE_ME.apps.googleusercontent.com',

  // Only Google accounts on this Workspace domain can sign in
  ALLOWED_DOMAIN: 'gofynd.com',

  // Sheet values are in Rs; divide to show Rs Cr
  UNIT_DIVISOR: 1e7,

  // Financial year
  FY_LABEL: 'FY27',
  ACTUAL_MONTHS: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
  PROJECTED_MONTHS: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],

  // CXOs shown in the book, in display order. JCP is reported separately.
  CXOS: ['Salman', 'Ragini', 'SMG', 'Dharmendra', 'Ronak', 'Jigar', 'Debajit', 'Kushan', 'Kavish'],
  SEPARATE_LINE: 'JCP',

  // Cache the computed book for this many seconds (max 21600)
  CACHE_SECONDS: 300,

  TABS: {
    // Who can see what. Maintained in the sheet by S&C.
    // Columns: Email | Role (admin / cxo) | CXO
    ACCESS: {
      name: 'Portal Access',
      fields: {
        email: ['Email', 'Email ID'],
        role: ['Role'],
        cxo: ['CXO', 'PNL Owner']
      }
    },

    // AOP / target per CXO
    SUMMARY: {
      name: 'Summary',
      fields: {
        cxo: ['CXO', 'PNL Owner', 'PNL Owner CXO'],
        target: ['AOP/ Target', 'AOP Target', 'AOP', 'Target']
      }
    },

    // One row per invoice line
    BILLED: {
      name: 'Revenue Billed YTD',
      fields: {
        cxo: ['CXO', 'PNL Owner', 'PNL Owner CXO'],
        month: ['Invoice Month', 'Month'],
        billed: ['Billed', 'Invoice Amount', 'Amount', 'Revenue'],
        received: ['Received', 'Amount Received', 'Receipts'],
        type: ['Revenue Type', 'Type', 'Category'],
        customer: ['Customer Name', 'Customer']
      },
      // Rows whose type matches are dropped entirely
      excludeTypes: ['Inter-company deposit', 'Intercompany Deposit', 'IC Deposit'],
      // Rows whose type matches are shown on their own line, outside totals
      otherIncomeTypes: ['Other Income']
    },

    // Owner tabs: one tab per CXO holding contract / pipeline lines.
    // Tab name = CXO name unless overridden here.
    OWNER: {
      tabNameFor: {},  // e.g. { Dharmendra: 'Dharam' }
      fields: {
        customer: ['Customer Name', 'Customer'],
        ip: ['IP', 'Product'],
        revenueType: ['Revenue Type'],
        ofStatus: ['Order form status', 'OF Status'],
        customerStatus: ['Customer Status'],
        live: ['Live', 'Is Live'],
        invoicedYtd: ['Invoiced Revenue (YTD)', 'Invoiced Revenue YTD', 'Invoiced YTD'],
        ofValue: ['Total Order Form Value', 'Order Form Value', 'OF Value'],
        estTcv: ['Estimated TCV', 'TCV'],
        expected: ['Expected Oct to Mar', 'Expected Oct-Mar', 'Expected Revenue Oct-Mar', 'Expected']
      }
    },

    // Optional. Owner commitment by month (25 September sheet).
    // Columns: CXO | Oct | Nov | ... | Mar | Sep
    // Used to phase unsigned lines and for the September check.
    COMMITMENT: {
      name: 'Commitment',
      optional: true,
      fields: {
        cxo: ['CXO', 'PNL Owner']
      }
    }
  },

  STATUS: {
    signedOf: ['Signed'],
    liveValues: ['Yes', 'Y', 'Live', 'TRUE'],
    sentOf: ['OF sent for signing', 'Commercial Sent'],
    proposalCustomer: ['Proposal Sent'],
    proposalOfAllowed: ['', 'Proposal Sent'],
    dropped: ['Churned', 'Expired', 'Dropped']
  }
};
