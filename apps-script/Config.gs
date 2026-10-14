/**
 * Fynd Finance Portal — configuration.
 *
 * Everything that depends on the layout of "MIS for Monthly Report FY27"
 * lives here. Header names are matched loosely (case, spaces and
 * punctuation ignored) and each field takes a list of aliases.
 * Run setupCheck() in the editor, or open the admin view, to see what matched.
 */

var CONFIG = {
  // MIS for Monthly Report FY27 (owner: muskankatta2@gofynd.com)
  SPREADSHEET_ID: '15gEZfqdeT1A9MPrK_DMfCPTLk59rmc_4dubmttWh7DI',

  // OAuth Web client ID (same value goes in web/config.js)
  OAUTH_CLIENT_ID: 'REPLACE_ME.apps.googleusercontent.com',
  ALLOWED_DOMAIN: 'gofynd.com',

  // Sheet values are in Rs; the portal shows Rs Cr
  UNIT_DIVISOR: 1e7,

  // Financial years as written in Revenue Data > Financial_Year
  CY: { key: 'FY2026-27', label: 'FY27' },
  LY: { key: 'FY2025-26', label: 'FY26' },

  // Display order. JCP is reported on its own line, outside "Total excluding JCP".
  CXOS: ['Salman', 'Ragini', 'SMG', 'Dharmendra', 'Ronak', 'Jigar', 'Debajit', 'Kushan', 'Kavish', 'Central', 'JCP'],
  SEPARATE_LINE: 'JCP',
  CXO_ALIASES: { Dharam: 'Dharmendra', Sreeraman: 'SMG' },

  CACHE_SECONDS: 300,

  TABS: {
    ACCESS: {
      name: 'Portal Access',
      fields: { email: ['Email', 'Email ID'], role: ['Role'], cxo: ['CXO', 'CXOs', 'PNL Owner'] }
    },

    REVENUE: {
      name: 'Revenue Data',
      fields: {
        customer: ['Company_Name', 'Customer Name'],
        fy: ['Financial_Year'],
        month: ['Month_YY'],
        voucher: ['Voucher_Type'],
        amount: ['Revenue_Netof_Tax'],
        receipt: ['Receipt Amount'],
        outstanding: ['Outstanding'],
        osStatus: ['O/s_Status'],
        invoiceDate: ['Invoice_date'],
        bu: ['Business_Unit'],
        ip: ['IP'],
        region: ['Region'],
        cxo: ['CXO'],
        entity: ['Billing Entity'],
        revenueType: ['Revenue_Type'],
        frequency: ['Frequency'],
        customerType: ['Customer Type'],
        businessType: ['Business Type']
      },
      // Revenue_Type patterns (case-insensitive regex)
      excludePattern: 'inter.?company|deposit',   // dropped entirely, like v0.7
      otherIncomePattern: 'other income'          // own line, outside totals
    },

    PNL: {
      name: 'CXO P/L',
      // Rows shown as sub-lines under the line above them
      children: {
        'Ops Cost': ['Ops Cost - Stock', 'DP & PG Cost', 'Purchase Cost Create'],
        'People Cost': ['Build', 'Sell', 'Support']
      },
      keyLines: ['Revenue', 'Total Expenses', 'EBITDA']
    },

    ORDER_FORM: {
      name: 'Order Form',
      fields: {
        ofNo: ['Order_Form_No'],
        customer: ['Customer_Name'],
        services: ['Services'],
        businessType: ['Business Type'],
        salesRep: ['Sales_Representative'],
        cxo: ['CXO'],
        region: ['Region'],
        qtr: ['QTR'],
        signed: ['Date_of_Signing'],
        term: ['Order_Form_Term'],
        value: ['Grand Total'],
        annualised: ['Annualised Value']
      }
    },

    // Used only to reconcile; never shown to CXOs
    RECON: {
      name: 'Billed Collected summary',
      fields: { cxo: ['CXO'], billed: ['Billed as per report', 'Billed'] }
    }
  }
};
