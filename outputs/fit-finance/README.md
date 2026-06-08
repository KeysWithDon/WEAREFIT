# F.I.T. Financial Integrity Training Portal

Open `index.html` in a browser or serve this folder with a local web server to use the prototype. The interface uses the supplied transparent F.I.T. logo throughout the sign-in experience, dashboards, worksheets, and About page.

## Demo accounts

- Member: `alex@fitdemo.com` / `demo123`
- Coach: `coach@fitdemo.com` / `demo123`

The member demo includes one worksheet already sent to the coach demo.

## Prototype behavior

- Password-based member and coach sign-in
- New-account signup with simulated email verification
- Required profile onboarding before members can create financial worksheets
- Member and coach profile photos with clean default avatars
- User-selectable light and dark modes with navy, gold, and white F.I.T. branding
- Member coach-designation requests and coach approval
- Coach email invitations, invite status, mentee profile viewing, and non-destructive mentee removal
- Editable financial worksheets based on the supplied FIT blank template
- Automatic calculations and browser autosave
- Available-after-bills updates immediately when contributions, payments, or budget numbers change
- Form history and new worksheet creation with account-holder or spouse assignment
- Send-finished-worksheet workflow with a coach review and approval queue
- Coach bill decisions for this check or the next check
- Bills marked for the next check automatically carry into the next worksheet
- Approved mortgage, debt, credit-card, and savings balances carry into new forms
- Financial profile storage for recurring bills, credit cards, and debts that populate new worksheets
- Recurring bill categories, including Insurance, with optional monthly schedules and automatic worksheet prefilling
- Debt APR and promotional-rate tracking
- Credit card purchase and balance-transfer promotional APR tracking with rate and future-date validation
- Debt this-check contributions that reduce carried balances
- Savings progress and coach-visible withdrawal reasons
- Manual savings and investment accounts with historical balance entries and a combined progress graph
- Financial profile with marital status, spouse name, employer, pay frequency, balances, and paystub archive
- Separate F.I.T. AI-style session reviews with coach notes, bill outcomes, action steps, and member feedback
- Coach cards highlight member name, check date, amount paid, and tithe
- About page featuring the FIT and God Cannot Lie Ministries logos and program story
- Church community link in the dashboard footer

## Production security note

This is a browser-only prototype. It stores accounts, uploaded-file previews, forms, session reviews, and permissions in the current browser. Email verification, invitations, secure file storage, and AI review generation are simulated locally. A production launch must connect these screens to secure authentication, a hosted database, encrypted private file storage, an email provider, server-side role and ownership checks, rate limiting, audit logging, backups, and a protected server-side AI integration. Never place banking credentials or private API keys in the frontend.
