// Global Updated server.js for BillEasePro (with Export/Import Support)

const express = require('express');
const fs = require('fs');
const path = require('path');
const pdf = require('html-pdf');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
const PORT = process.env.PORT || 3000;

const TENANTS_FILE = path.join(__dirname, 'data', 'tenants.json');
const BILLS_FILE = path.join(__dirname, 'data', 'bills.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Ensure data files exist
if (!fs.existsSync(TENANTS_FILE)) fs.writeFileSync(TENANTS_FILE, '[]');
if (!fs.existsSync(BILLS_FILE)) fs.writeFileSync(BILLS_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) {
  const defaultUser = [{ username: 'admin', passwordHash: bcrypt.hashSync('admin123', 10) }];
  fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUser, null, 2));
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: '92507993998', resave: false, saveUninitialized: false }));

// Auth middleware
function ensureAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.redirect('/login');
}

// === LOGIN ===
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  const user = users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.send('Invalid credentials. <a href="/login">Try again</a>.');
  }
  req.session.authenticated = true;
  req.session.username = username;
  res.redirect('/');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

// === VIEWS ===
app.get('/', ensureAuth, (_, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.get('/tenants', ensureAuth, (_, res) => res.sendFile(path.join(__dirname, 'views', 'tenants.html')));
app.get('/bills', ensureAuth, (_, res) => res.sendFile(path.join(__dirname, 'views', 'bills.html')));

// === TENANTS API ===
app.get('/api/tenants', ensureAuth, (_, res) => res.json(JSON.parse(fs.readFileSync(TENANTS_FILE))));
app.post('/api/tenants', ensureAuth, (req, res) => {
  const tenants = JSON.parse(fs.readFileSync(TENANTS_FILE));
  tenants.push(req.body);
  fs.writeFileSync(TENANTS_FILE, JSON.stringify(tenants, null, 2));
  res.sendStatus(200);
});
app.put('/api/tenants/:id', ensureAuth, (req, res) => {
  const tenants = JSON.parse(fs.readFileSync(TENANTS_FILE));
  tenants[req.params.id] = req.body;
  fs.writeFileSync(TENANTS_FILE, JSON.stringify(tenants, null, 2));
  res.sendStatus(200);
});
app.delete('/api/tenants/:id', ensureAuth, (req, res) => {
  const tenants = JSON.parse(fs.readFileSync(TENANTS_FILE));
  tenants.splice(req.params.id, 1);
  fs.writeFileSync(TENANTS_FILE, JSON.stringify(tenants, null, 2));
  res.sendStatus(200);
});

// === BILLS API ===
app.get('/api/bills', ensureAuth, (_, res) => res.json(JSON.parse(fs.readFileSync(BILLS_FILE))));
app.post('/api/bills', ensureAuth, (req, res) => {
  const bills = JSON.parse(fs.readFileSync(BILLS_FILE));
  bills.push({ ...req.body, date: new Date().toLocaleString(), id: bills.length, status: 'Unpaid' });
  fs.writeFileSync(BILLS_FILE, JSON.stringify(bills, null, 2));
  res.sendStatus(200);
});

app.put('/api/bills/:id/status', ensureAuth, async (req, res) => {
  const { newStatus, password } = req.body;
  if (!['Paid', 'Unpaid'].includes(newStatus)) return res.status(400).send('Invalid status');
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  const admin = users.find(u => u.username === 'admin');
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) return res.status(403).send('Incorrect admin password');
  const bills = JSON.parse(fs.readFileSync(BILLS_FILE));
  if (!bills[req.params.id]) return res.status(404).send('Bill not found');
  bills[req.params.id].status = newStatus;
  fs.writeFileSync(BILLS_FILE, JSON.stringify(bills, null, 2));
  res.sendStatus(200);
});

app.delete('/api/bills/:id', ensureAuth, (req, res) => {
  const bills = JSON.parse(fs.readFileSync(BILLS_FILE));
  bills.splice(req.params.id, 1);
  fs.writeFileSync(BILLS_FILE, JSON.stringify(bills, null, 2));
  res.sendStatus(200);
});

// === PDF Generation ===
app.get('/api/bills/pdf/:id', ensureAuth, (req, res) => {
  const bills = JSON.parse(fs.readFileSync(BILLS_FILE));
  const bill = bills[req.params.id];
  if (!bill) return res.status(404).send('Not found');

  const now = new Date().toLocaleString();
  const isUnpaid = bill.status === 'Unpaid';

  const html = `
    <html>
    <head>
      <style>
        body {
          font-family: 'Segoe UI', sans-serif;
          padding: 40px;
          color: #333;
          background-color: ${isUnpaid ? '#fff7f7' : '#ffffff'};
        }
        h1 {
          color: ${isUnpaid ? '#b71c1c' : '#2d2e83'};
          text-align: center;
        }
        p {
          text-align: center;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          border: 1px solid #ccc;
          padding: 10px;
          text-align: left;
        }
        .footer {
          margin-top: 30px;
          text-align: center;
          font-size: 13px;
          color: #888;
          border-top: 1px dashed #ccc;
          padding-top: 10px;
        }
        .warning {
          background-color: #ffe5e5;
          padding: 10px;
          color: #b71c1c;
          border: 1px solid #f5c6cb;
          margin-top: 20px;
          text-align: center;
          font-weight: bold;
        }
        .paid-badge {
          color: green;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <h1>BillEasePro - Rent Invoice</h1>
      <p>Generated on ${now}</p>

      ${isUnpaid ? `
        <div class="warning">
          ⚠️ Payment Pending – Please pay the due amount at the earliest.
        </div>
      ` : `
        <p class="paid-badge">✅ This invoice has been marked as Paid.</p>
      `}

      <table>
        <tr><th>Tenant</th><td>${bill.tenantName}</td></tr>
        <tr><th>Mobile</th><td>${bill.mobile}</td></tr>
        <tr><th>Rent Month</th><td>${bill.monthYear}</td></tr>
        <tr><th>Owner</th><td>${bill.owner} (${bill.ownerMobile})</td></tr>
        <tr><th>Through</th><td>${bill.through}</td></tr>
        <tr><th>Mode</th><td>${bill.paymentMode}${bill.utr ? ' (UTR: ' + bill.utr + ')' : ''}</td></tr>
        <tr><th>Amount</th><td>₹${bill.amount}</td></tr>
        <tr><th>Date</th><td>${bill.date}</td></tr>
        <tr><th>Status</th><td>${bill.status}</td></tr>
      </table>

      ${isUnpaid ? `
        <div class="warning">
          💡 Kindly ensure the rent is paid by the due date to avoid penalties.
        </div>
      ` : ''}

      <div class="footer">Generated by BillEasePro</div>
    </body>
    </html>
  `;

  const fname = `${bill.tenantName.replace(/\s+/g, '_')}_${bill.date.split(',')[0].replace(/\//g, '-')}.pdf`;

  pdf.create(html).toStream((err, stream) => {
    if (err) return res.status(500).send('PDF error');
    res.setHeader('Content-disposition', `attachment; filename=${fname}`);
    res.setHeader('Content-type', 'application/pdf');
    stream.pipe(res);
  });
});


// === EXPORT ===
app.get('/api/export/tenants', ensureAuth, (_, res) => res.download(TENANTS_FILE, 'tenants.json'));
app.get('/api/export/bills', ensureAuth, (_, res) => res.download(BILLS_FILE, 'bills.json'));
app.get('/api/export/users', ensureAuth, (_, res) => res.download(USERS_FILE, 'users.json'));

// === IMPORT ===
function handleImport(req, res, filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(req.file.path, 'utf-8'));
    if (!Array.isArray(data)) return res.status(400).send('Invalid format');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.sendStatus(200);
  } catch (e) {
    res.status(400).send('Failed to import');
  } finally {
    fs.unlinkSync(req.file.path);
  }
}
app.post('/api/import/tenants', ensureAuth, upload.single('file'), (req, res) => handleImport(req, res, TENANTS_FILE));
app.post('/api/import/bills', ensureAuth, upload.single('file'), (req, res) => handleImport(req, res, BILLS_FILE));
app.post('/api/import/users', ensureAuth, upload.single('file'), (req, res) => handleImport(req, res, USERS_FILE));

// Start Server
app.listen(PORT, () => console.log(`✅ BillEasePro running at http://localhost:${PORT}`));
