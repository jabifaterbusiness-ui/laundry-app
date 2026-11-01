import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QUICK_OPERATIONS } from "../../lib/quick-operations-catalog.js";
import { useAuthStore } from "../../state/auth-store.js";
import "./HelpCentrePage.css";

type Guide = { title: string; summary: string; steps: string[]; links?: { label: string; href: string }[] };
const GROUPS: { category: string; intro: string; guides: Guide[] }[] = [
 { category:"Getting started", intro:"Set up the business and learn the daily front-desk workflow.", guides:[
  {title:"First-time setup",summary:"Prepare LaundryAngel before accepting live orders.",steps:[
   "Register your business or complete the first-owner setup. Sign in and check the business identity and contact details.",
   "Create your first branch, assign the people who work there, and give each person only the permissions needed for their duties.",
   "Add services and prices, maintain the colour catalogue and inventory items, upload the business logo, set receipt appearance and review the default customer agreement.",
   "Set up your subscription, connect and verify a backup destination, then run a test backup. Create a test customer and order and print a sample receipt before going live.",
   "Before entering orders, confirm the active branch in the top bar. Staff assigned to several branches must choose the correct outlet."
  ],links:[["Business settings","/business/settings"],["Branches","/branches"],["Price list","/services"],["Backup & migration","/data-management"]].map(([label,href])=>({label,href}))},
  {title:"Create a customer and an order",summary:"From customer lookup to an order and customer receipt.",steps:[
   "Open Orders and search for the customer by name or phone. Select an existing customer where possible to avoid duplicates. If no match exists, use the add-customer action and enter the customer's name and phone; email, address and notes are optional.",
   "Start the order, add the garments/services, quantities and available garment details, then review the calculated charges and save.",
   "Confirm the order is in the correct branch and status folder. Use the available invoice or receipt action to print or share the customer document.",
   "Move work through the available statuses as garments are received, processed and ready for pickup. Record money actually received through the payment flow and confirm collection before handing over garments."
  ],links:[{label:"Orders",href:"/orders"},{label:"Customers",href:"/customers"},{label:"Payments",href:"/payments"}]},
  {title:"Order statuses, cancellation and deletion",summary:"Correct mistakes without damaging financial history.",steps:[
   "Use the order folders to find Received, Outstanding / Unpicked, Ready for Pickup / Completed, Cancelled and All Orders. Available status transitions depend on the current order state and your permissions.",
   "If an order was created by mistake, use the supported cancellation or void workflow and provide the reason/confirmation requested. Do not assume that an order can simply be deleted: orders may be linked to invoices, payments and garment history.",
   "Invoice deletion, payment voiding and refunds are separate controlled actions. They require the relevant permissions and may require a reason or sensitive password re-authentication. Prefer cancellation or a documented correction over erasing history."
  ],links:[{label:"Orders",href:"/orders"},{label:"Invoices",href:"/invoices"}]},
  {title:"Print an order, invoice or receipt",summary:"Produce a paper or digital customer record.",steps:[
   "Open the relevant order or invoice and use its invoice/receipt or print action. Reprint an existing document with the Reprint Invoice / Receipt quick operation when your permission allows it.",
   "Receipt appearance follows the logo, colours and header style in Business Settings. Print a sample after changing branding and check paper size and scaling.",
   "A receipt records a transaction; do not mark an invoice paid until the money has actually been received and recorded."
  ],links:[{label:"Invoices & receipts",href:"/invoices"},{label:"Business settings",href:"/business/settings"}]}
 ]},
 {category:"Branches and staff access",intro:"Understand outlet management, staff membership and permission control.",guides:[
  {title:"Branches: how they work and why they matter",summary:"Operate multiple outlets under one business account.",steps:[
   "A branch represents a physical outlet or operating location belonging to the same business. Create a branch for each shop that needs its own operating context.",
   "Branches let management assign staff to the locations where they work, select the active outlet, and review branch-aware operations and reports separately. This improves accountability, reduces work being entered against the wrong outlet and supports outlet performance comparisons.",
   "Branches belong to one business tenant; they are not separate business accounts. Operational records and branch-aware reports use the selected branch context, while some business settings and the annual financial report are business-wide.",
   "A user may belong to several branches. Membership determines which active branches they can select; the active branch is the current working context, not a permission grant. Permissions still determine what they may do.",
   "Create clear branch names and accurate addresses. Assign staff to the correct outlets, grant their required permissions and remind them to check the branch selector before entering orders, payments or stock movements.",
   "Deactivating a branch removes it from active working choices. It does not mean its historical records should be deleted. Reactivate it only when management is ready for it to operate again."
  ],links:[{label:"Branch management",href:"/branches"},{label:"Users",href:"/users"},{label:"Permissions",href:"/permissions"}]},
  {title:"Create a branch and assign users",summary:"Step-by-step outlet setup.",steps:[
   "Open Branches and choose Add Branch. Enter the branch name and address, then create it. Your account needs branch-creation permission.",
   "In the branch list choose Manage Users. Select an active user and assign them to the branch. Repeat for each employee who works there.",
   "A user can be assigned to multiple branches. The user form also lets management choose branch memberships when creating or editing an account.",
   "The top-bar branch selector shows active branches the signed-in user belongs to. Choose the correct branch before branch-aware work. Changing branches refreshes data views.",
   "Branch membership decides where a user can work; permissions decide what the user can do. Both must be configured correctly."
  ],links:[{label:"Branches",href:"/branches"},{label:"Users",href:"/users"}]},
  {title:"Create users and grant permissions",summary:"Job titles describe a role; permission keys grant access.",steps:[
   "Open Users and select New User. Enter full name, email, optional username, a password of at least eight characters, a descriptive job title and branch memberships.",
   "A job title is descriptive only; it does not automatically grant access. Open Permissions and grant the minimum permission keys required for the person's duties, such as customers.view, orders.create or payroll.view.",
   "Use least privilege. Review permissions when duties change and deactivate or remove access when a staff member leaves. User deletion is controlled and requires a reason.",
   "Sensitive actions may require password re-authentication after inactivity or before a high-impact operation. This is an extra security check, not a substitute for permissions."
  ],links:[{label:"Users",href:"/users"},{label:"Permissions",href:"/permissions"}]}
 ]},
 {category:"Business setup and subscription",intro:"Configure customer-facing identity and keep the service active.",guides:[
  {title:"Business identity, logo and receipt appearance",summary:"Make receipts reflect your business.",steps:[
   "Open Business Settings and review the business name, phone, email and address displayed under Business Identity. These details come from the registered business profile.",
   "Upload a PNG, JPG/JPEG or WebP logo. The uploader requires at least 200 × 200 pixels and no more than 5 MB; 500 × 500 pixels is recommended. A square logo is recommended.",
   "Choose receipt primary, accent, background and text colours, then select Standard, Compact or Centered header style. Save and print a sample receipt.",
   "Set the default customer agreement if you use standard care, collection or service terms. Leave the agreement field unchanged if you do not intend to replace the existing agreement."
  ],links:[{label:"Business settings",href:"/business/settings"}]},
  {title:"Subscribe to LaundryAngel",summary:"Choose a plan and complete secure billing.",steps:[
   "Open Subscription. Review the plans, prices, billing currency, payment providers and methods currently available to your business.",
   "Choose a plan, select a supported payment provider and payment method, then continue to the provider's secure checkout. Return to LaundryAngel so the payment can be verified and the subscription status refreshed.",
   "If connectivity is unavailable, the page may allow an authorised offline payment request with a reason. An offline request is queued for later processing; it is not proof that a subscription is active.",
   "Rely on the verified subscription status shown in the app. If you paid but the status does not update, contact laundryangel2026@gmail.com."
  ],links:[{label:"Subscription",href:"/subscription"}]}
 ]},
 {category:"Daily operations",intro:"Maintain your catalogue, customer records, payments and stock.",guides:[
  {title:"Services and price list",summary:"Maintain the prices used when creating orders.",steps:[
   "Open Services & Price List. Add each service with its name, pieces per unit and unit price in naira. Edit a service when its name, pieces or price changes.",
   "Deactivate services that should no longer be offered. Deactivation preserves the catalogue record and is safer than removing a service referenced by historical orders.",
   "Use the Excel or PDF export controls to download the complete business price list, including active and inactive services."
  ],links:[{label:"Services & price list",href:"/services"}]},
  {title:"Customers and customer records",summary:"Keep contact details and customer history accurate.",steps:[
   "Use Customers to search by name or phone, add a customer, edit details or change lifecycle status. Possible duplicate phone numbers are flagged so staff can confirm before creating another record.",
   "Statuses include Active, Dormant, Blocked and Blacklisted. A status change requires a reason and is recorded in the customer's history.",
   "Customer export includes every customer in the business, not only the current page or selected status filter. The file contains personal contact information; review it before sharing."
  ],links:[{label:"Customers",href:"/customers"}]},
  {title:"Payments, invoices and receipts",summary:"Record collections and keep balances accurate.",steps:[
   "Invoices show charges and outstanding balances. Payments record money actually received and are linked to the relevant invoice/order. Select the correct method and enter a reference where applicable.",
   "Use invoice and payment pages to review transaction history. A refund or void is a controlled financial action; confirm the payment, amount and reason before submitting.",
   "Reprint or resend a receipt when a customer needs another copy. Reprinting does not create a new payment."
  ],links:[{label:"Invoices",href:"/invoices"},{label:"Payments",href:"/payments"}]},
  {title:"Inventory and colour catalogue",summary:"Keep stock and garment descriptions consistent.",steps:[
   "Use Inventory to maintain stock items and record receipts when supplies arrive or issues when supplies are consumed. Stock movements should be recorded against the correct active branch.",
   "Use Colour Catalogue to maintain the colour choices available for garment/order details. Keep names clear and consistent so staff select the same descriptions."
  ],links:[{label:"Inventory",href:"/inventory"},{label:"Colour catalogue",href:"/colors"}]}
 ]},
 {category:"Finance, payroll and oversight",intro:"Review business performance, staff pay and unusual activity.",guides:[
  {title:"Finance",summary:"Understand income, expenses and financial controls.",steps:[
   "Open Finance. Access is permission-controlled; reports.view and/or expenses.view may be required for the corresponding areas.",
   "Use the expense workflow to record business costs with a meaningful category, date, amount, description and supporting reference. Follow the approval controls shown on the page and do not approve your own request where separation-of-duties controls apply.",
   "Review expenses alongside collections and revenue. Reconcile the application's records with bank/cash records and source documents regularly; summaries are an operational aid, not a replacement for accounting review."
  ],links:[{label:"Finance",href:"/finance"},{label:"Reports",href:"/reports"}]},
  {title:"Payroll: requests, approvals and payment",summary:"Process staff pay through controlled stages.",steps:[
   "Open Payroll and select the relevant payroll period. Review the staff included, earnings and deductions before generating or submitting payroll. Check period dates and totals carefully.",
   "Payroll uses controlled stages including processing, pending approval, approved and finalised/paid. Submit for approval; an authorised approver reviews the figures and approves or declines with a reason.",
   "Separation of duties applies: the requester must not approve their own payroll request where the workflow enforces this control.",
   "Finalise/pay only after approval and after confirming amounts and funds. Finalisation is consequential; verify the period, staff and totals before confirming. If declined, correct the issue and resubmit through the permitted workflow."
  ],links:[{label:"Payroll",href:"/payroll"}]},
  {title:"IOUs, loans and repayments",summary:"Track staff advances and recoveries separately from payroll.",steps:[
   "Open IOUs, Loans & Repayments under Payroll. Create an IOU or loan for the correct staff member, enter the amount and terms requested by the form, and provide the reason or supporting details.",
   "A submitted request is subject to the approval workflow; it is not proof that money has already been disbursed. Record the actual payout through the matching controls.",
   "Record repayments against the correct IOU or loan. Check the outstanding balance and transaction history before recording another repayment."
  ],links:[{label:"IOUs, loans & repayments",href:"/payroll/financial"}]},
  {title:"Reports: periods, annual view and interpretation",summary:"Understand operational and financial performance.",steps:[
   "Open Reports. Choose From and To dates and select Apply. Choose All Time to remove the date restriction. The dashboard report is branch-aware; confirm the selected branch before reviewing it.",
   "The operational report includes total orders, invoice count/value, outstanding balances, collections and collection rate, picked-up and unpicked garments, payments received/refunded/net received, active customers, stock items and stock movements.",
   "Outstanding invoices are grouped by year and month. Management insights highlight attention areas such as overdue balances or operational backlogs.",
   "The Annual Financial Report is business-wide across all branches. Select a year to review gross invoiced revenue, refunds, net revenue, expenses, profit/loss, invoice and collection totals, collection rate, year-end outstanding balances, monthly trends and management insights.",
   "Reports depend on accurate transaction entry. Record payments, refunds, expenses, status changes and stock movements promptly, and compare totals with source records before making decisions."
  ],links:[{label:"Reports",href:"/reports"}]},
  {title:"Suspicious / Unusual Activity",summary:"Spot sensitive changes and investigate early.",steps:[
   "Open Suspicious / Unusual Activity to review high-risk and critical audit events. Events can include logins/logouts, password resets, new or disabled users, permission changes, allow-all/disallow-all permission actions, invoice edits/deletions/transfers and voided payments.",
   "Review the event type, actor, time, risk level and available details to decide whether the action was expected. Mark an event as seen after review; this is a review aid, not proof that it was harmless.",
   "If an event is unexpected, contact the user or manager, inspect the related record and permissions, secure the affected account and follow your incident procedure. Never share passwords or access tokens while investigating.",
   "The section improves accountability and helps management investigate mistakes or potential misuse before losses grow."
  ],links:[{label:"Suspicious activity",href:"/security/suspicious-activity"}]}
 ]},
 {category:"Backup, restore and migration",intro:"Protect business data and move safely from an older laundry system.",guides:[
  {title:"Instant Local Backup",summary:"Create a backup immediately in a folder on this device.",steps:[
   "Open Backup & Data Migration and locate Instant Local Backup. Choose a local folder when prompted, then use the manual backup action to create a backup immediately.",
   "The browser must support the File System Access API and the site must use secure HTTPS (localhost is also treated as secure by modern browsers). The selected folder must remain accessible.",
   "Instant Local Backup is user-triggered: it runs now and saves to the selected device folder. It is not a cloud backup and does not run while the browser/page is closed."
  ],links:[{label:"Backup & data migration",href:"/data-management"}]},
  {title:"Local backup schedules",summary:"Run browser-managed backups on a recurring timetable.",steps:[
   "Select a local folder first, then add a local schedule and choose the interval and time options offered by the page. Review the schedule list and its enabled/paused status.",
   "Local schedules run only while the Backup page is open, the browser is running and the folder is accessible. They are not a server-side 24/7 scheduler. Keep the device powered and the page open during the scheduled window.",
   "Check local backup history after a run. If the browser reports that the folder is unavailable, reselect the folder and verify browser permissions."
  ],links:[{label:"Backup & data migration",href:"/data-management"}]},
  {title:"Cloud backups and schedules",summary:"Store encrypted backups with a verified cloud destination.",steps:[
   "Connect a supported provider shown in the cloud backup section: Google Drive, Dropbox or OneDrive. Complete provider authorization/configuration and then run connection verification.",
   "A destination is selectable only when its status is Connected and it has a verification timestamp. A saved but unverified or errored connection is not a usable destination.",
   "Choose the destination, configure available settings such as frequency, time zone and retention, save, and create a cloud schedule. Cloud schedules are server-managed, unlike browser-managed local schedules. You can also start a manual cloud backup.",
   "Review run history for status and errors. A successful backup should be followed by a restore rehearsal in a safe environment. Keep provider credentials and backup passwords private."
  ],links:[{label:"Backup & data migration",href:"/data-management"}]},
  {title:"Import from previous software: accepted files and current scope",summary:"Analyse a legacy backup before confirming an import.",steps:[
   "The migration analyser recognises DBF / Visual FoxPro-style backups, ZIP archives containing DBF/CSV/JSON/XLSX files, CSV, JSON, XLSX/XLS and versioned encrypted LaundryAngel backups.",
   "The current legacy import target is customer records. A DBF/FoxPro backup can recognise CUSTOMER.DBF and common name, phone, address, email and notes fields. Other source tables are reported as unsupported in the preview; do not assume orders, garments, invoices, payments or inventory are imported yet.",
   "Choose the source file, run analysis, inspect the preview and field mapping, then select the duplicate policy (skip, merge missing information or create a separate record) before confirming. Imports are business-scoped, audited and do not delete existing records.",
   "ZIP uploads are checked for unsafe paths and excessive file counts or decompressed size. Do not rename unrelated files to a supported extension or upload unknown executables."
  ],links:[{label:"Backup & data migration",href:"/data-management"}]},
  {title:"Encrypted application backup and restore",summary:"Understand export, restore and legacy migration.",steps:[
   "Application backup export creates a versioned encrypted backup protected with AES-256-GCM and a password-derived key. Use a strong backup password of at least 12 characters and store it securely away from the server.",
   "Restore accepts an encrypted LaundryAngel backup file and its password. Current restore is merge-only: it does not delete existing records or overwrite current staff credentials. Make a fresh backup before restoring.",
   "A local instant backup is saved to a folder on this device. A cloud backup is sent to a verified provider. A migration import reads a legacy source format and maps supported records into LaundryAngel. These are separate workflows.",
   "Backup success is not enough: periodically check the backup history and perform a restore rehearsal in a safe test environment. Never send a backup password to support."
  ],links:[{label:"Backup & data migration",href:"/data-management"}]}
 ]}
];

export function HelpCentrePage() {
 const user = useAuthStore((state) => state.user);
 const [query,setQuery] = useState("");
 const term = query.trim().toLowerCase();
 const groups = useMemo(() => GROUPS.map((group) => ({...group,guides:group.guides.filter((guide) => !term || [group.category,guide.title,guide.summary,...guide.steps].join(" ").toLowerCase().includes(term))})).filter((group) => group.guides.length),[term]);
 const operations = useMemo(() => QUICK_OPERATIONS.filter((op) => !term || [op.code,op.name,op.description,op.permission].join(" ").toLowerCase().includes(term)),[term]);
 function openOperation(operation: typeof QUICK_OPERATIONS[number]) { window.dispatchEvent(new CustomEvent("quick-operation:open",{detail:operation})); }
 return <main className="help-centre">
  <header className="help-hero"><div className="help-hero-copy"><span className="help-eyebrow">LAUNDRYANGEL KNOWLEDGE HUB</span><h1>Help Centre</h1><p>Clear, practical guides for setting up your laundry business, serving customers and managing every outlet with confidence.</p><label className="help-search"><span aria-hidden="true">⌕</span><input aria-label="Search help articles and shortcuts" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search orders, branches, payroll, backups…"/></label></div><div className="help-hero-mark" aria-hidden="true"><span>LA</span><small>HELP<br/>DESK</small></div></header>
  <section className="help-welcome-grid"><article><strong>Work in the right branch</strong><p>Confirm the active branch in the top bar before entering branch-aware records.</p></article><article><strong>Protect your data</strong><p>Keep local and verified cloud backups, and periodically test a restore.</p></article><article><strong>Need a person?</strong><p>Email <a href="mailto:laundryangel2026@gmail.com">laundryangel2026@gmail.com</a> for further assistance.</p></article></section>
  <div className="help-section-heading"><div><span>LEARN THE WORKSPACE</span><h2>Guides by topic</h2></div><small>{GROUPS.reduce((count,group)=>count+group.guides.length,0)} practical guides</small></div>
  {groups.length ? groups.map((group)=><section className="help-category" key={group.category}><div className="help-category-heading"><div><h2>{group.category}</h2><p>{group.intro}</p></div><span>{String(group.guides.length).padStart(2,"0")}</span></div><div className="help-guide-list">{group.guides.map((guide)=><details className="help-guide" key={guide.title}><summary><span className="help-guide-chevron">＋</span><span><strong>{guide.title}</strong><small>{guide.summary}</small></span></summary><div className="help-guide-body"><ol>{guide.steps.map((step,index)=><li key={index}>{step}</li>)}</ol>{guide.links?.length ? <div className="help-guide-links">{guide.links.map((link)=><Link key={link.href} to={link.href}>{link.label} ↗</Link>)}</div>:null}</div></details>)}</div></section>):<p className="help-empty">No guides match that search. Try another keyword or contact support.</p>}
  <section className="help-shortcuts"><div className="help-section-heading"><div><span>POWER USER TOOLS</span><h2>Quick Operations shortcuts</h2></div><small>{operations.length} shortcuts</small></div><p className="help-shortcuts-intro">Use the global search field in the top bar. Type a shortcut code or operation name, then select the matching Quick Operation. Access depends on your permission; sensitive actions require a reason and confirmation.</p><div className="help-shortcut-grid">{operations.map((op)=><article className="help-shortcut-card" key={op.code}><span className="help-shortcut-code">{op.code}</span><div><strong>{op.name}</strong><p>{op.description}</p><small>Permission: <code>{op.permission}</code>{op.sensitive?" · Sensitive":""}{op.requiresConfirmation?" · Confirmation required":""}</small></div><button type="button" onClick={()=>openOperation(op)} disabled={!user?.permissions?.includes(op.permission)}>Open</button></article>)}</div></section>
  <footer className="help-footer"><div><span>WE’RE HERE TO HELP</span><h2>Need further assistance?</h2><p>Send a short description of the issue and the page you were using. Never include passwords, backup passwords or access tokens.</p></div><a href="mailto:laundryangel2026@gmail.com">laundryangel2026@gmail.com</a></footer>
 </main>;
}
