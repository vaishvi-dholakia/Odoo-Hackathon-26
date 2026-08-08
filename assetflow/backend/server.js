const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'assetflow_super_secret_key_123!';

app.use(cors());
app.use(express.json());

// Log incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Middleware for JWT Authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required.' });
  }

  // Backwards compatibility for offline mock tokens has been removed.

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
}

// Initialize DB and start server
db.initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`AssetFlow Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

// --- API ROUTES ---

// 0. Developer Endpoints
app.post('/api/dev/reset-db', async (req, res) => {
  try {
    await db.resetDatabase();
    res.json({ success: true, message: 'Database reset successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 1. Authentication Endpoints
const handleRegister = async (req, res) => {
  const { email, password, fullName, role, department } = req.body;
  try {
    if (!email || !password || !fullName) {
      return res.status(400).json({ message: 'Full name, email, and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    const cleanName = fullName.trim();
    const cleanRole = (role || 'Employee').trim();
    const cleanDept = (department || 'IT').trim();

    const existing = await db.query('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email address is already registered.' });
    }
    
    const avatar = null;
    await db.query(
      'INSERT INTO users (email, password, fullName, role, department, avatar, isVerified, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [cleanEmail, cleanPassword, cleanName, cleanRole, cleanDept, avatar, true, 'Active']
    );
    res.status(201).json({ success: true, message: 'User registered successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

app.post('/api/auth/register', handleRegister);
app.post('/api/auth/signup', handleRegister);

app.post('/api/auth/login', async (req, res) => {
  let { email, password, role } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email address and password are required.' });
    }

    if (!role) {
      return res.status(400).json({ message: 'Please select your role.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    // 1. Fetch user by email (case-insensitive)
    const users = await db.query('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (users.length === 0) {
      return res.status(404).json({ message: `No account found with email "${email}". Please check with your Administrator.` });
    }

    const dbUser = users[0];

    // Helper to normalize role strings for flexible matching
    const norm = (r) => (r || '').toLowerCase().replace(/[\s_]/g, '');

    // 2. Check if selected role matches user's registered role
    if (norm(role) !== norm(dbUser.role)) {
      return res.status(400).json({ 
        message: `Account found, but it is registered under the role "${dbUser.role}". Please select "${dbUser.role}" from the role dropdown.` 
      });
    }

    // 3. Verify password
    if ((dbUser.password || '').trim() !== cleanPassword) {
      return res.status(401).json({ message: 'Incorrect password. Please check your password and try again.' });
    }

    // 4. Verify account status is active
    const userStatus = (dbUser.status || 'Active').toLowerCase();
    if (userStatus !== 'active') {
      return res.status(403).json({ message: `Your account status is currently "${dbUser.status}". Please contact your Administrator.` });
    }

    const userPayload = {
      email: dbUser.email,
      name: dbUser.fullName,
      role: dbUser.role,
      department: dbUser.department,
      avatar: dbUser.avatar
    };

    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, user: userPayload });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/auth/verify-otp', (req, res) => {
  res.json({ success: true, message: 'Verified successfully!' });
});

app.post('/api/auth/resend-otp', (req, res) => {
  res.json({ success: true, message: 'OTP sent!' });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'User with this email not found.' });
    }
    res.json({ success: true, message: 'Password reset code simulated.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    await db.query('UPDATE users SET password = ? WHERE email = ?', [newPassword, email]);
    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 1.5. User Management Endpoints
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await db.query('SELECT email, fullName, role, department, avatar, isVerified, status, transitionDetails FROM users ORDER BY fullName ASC');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. Organization Endpoints
app.get('/api/org', async (req, res) => {
  try {
    const orgs = await db.query('SELECT * FROM organization LIMIT 1');
    res.json(orgs[0] || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/org', authenticateToken, async (req, res) => {
  const { name, code, industry, address, phone, website } = req.body;
  try {
    const orgs = await db.query('SELECT id FROM organization LIMIT 1');
    if (orgs.length > 0) {
      await db.query(
        'UPDATE organization SET name = ?, code = ?, industry = ?, address = ?, phone = ?, website = ? WHERE id = ?',
        [name, code, industry, address, phone, website, orgs[0].id]
      );
    } else {
      await db.query(
        'INSERT INTO organization (name, code, industry, address, phone, website) VALUES (?, ?, ?, ?, ?, ?)',
        [name, code, industry, address, phone, website]
      );
    }
    res.json({ success: true, message: 'Organization saved successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2.5. Department Endpoints
app.get('/api/departments', async (req, res) => {
  try {
    const departments = await db.query('SELECT * FROM departments ORDER BY name ASC');
    res.json(departments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/departments', authenticateToken, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Department name is required.' });
  }

  if (req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Access Denied: Only administrators can add new departments.' });
  }

  try {
    const existing = await db.query('SELECT * FROM departments WHERE name = ?', [name.trim()]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Department already exists.' });
    }

    await db.query('INSERT INTO departments (name) VALUES (?)', [name.trim()]);
    res.status(201).json({ success: true, message: 'Department added successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/departments/:name', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Access Denied: Only administrators can delete departments.' });
  }
  const { name } = req.params;
  try {
    await db.query('DELETE FROM departments WHERE name = ?', [name]);
    res.json({ success: true, message: 'Department deleted successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 3. Asset Endpoints
app.get('/api/assets', async (req, res) => {
  try {
    const assets = await db.query('SELECT * FROM assets');
    res.json(assets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/assets', authenticateToken, async (req, res) => {
  const { name, type, serial, status, value, location, owner, department } = req.body;
  try {
    // Generate AST-XXX ID
    const countRes = await db.query('SELECT COUNT(*) as count FROM assets');
    const count = countRes[0].count + 1;
    const newId = 'AST-' + String(count).padStart(3, '0');

    await db.query(
      'INSERT INTO assets (id, name, type, serial, status, value, location, owner, department) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [newId, name, type, serial, status || 'Active', value, location, owner || null, department || null]
    );
    res.status(201).json({ success: true, asset: { id: newId, name, type, serial, status, value, location, owner, department } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/assets/:id', authenticateToken, async (req, res) => {
  const { name, type, serial, status, value, location, owner, department } = req.body;
  const { id } = req.params;
  try {
    await db.query(
      'UPDATE assets SET name = ?, type = ?, serial = ?, status = ?, value = ?, location = ?, owner = ?, department = ? WHERE id = ?',
      [name, type, serial, status, value, location, owner || null, department || null, id]
    );
    res.json({ success: true, message: 'Asset updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/assets/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM assets WHERE id = ?', [id]);
    res.json({ success: true, message: 'Asset deleted successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 4. Allocation Endpoints
app.get('/api/allocations', async (req, res) => {
  try {
    const allocations = await db.query('SELECT * FROM allocations');
    res.json(allocations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/allocations', authenticateToken, async (req, res) => {
  const { assetId, assetName, allocatedTo, date, notes } = req.body;
  try {
    const countRes = await db.query('SELECT COUNT(*) as count FROM allocations');
    const count = countRes[0].count + 1;
    const newId = 'ALC-' + String(count).padStart(3, '0');

    const userRole = req.user.role;
    const userDept = req.user.department || 'Management';
    const userName = req.user.fullName || req.user.name || req.user.email;
    const userEmail = req.user.email;

    let status = 'Pending Approval';
    let targetRole = 'Department Head';

    if (userRole === 'Employee') {
      status = 'Pending Department Head Approval';
      targetRole = 'Department Head';
    } else {
      // Department Head, Asset Manager, Admin -> Instant 100% Direct Approval!
      status = 'Approved';
      targetRole = 'Approved';
    }

    const targetAllocatedTo = allocatedTo || userName;
    const timeString = new Date().toISOString().replace('T', ' ').substring(0, 16);

    let targetDept = userDept;
    try {
      const deptCheck = await db.query('SELECT name FROM departments WHERE name = ?', [targetAllocatedTo]);
      if (deptCheck.length > 0) {
        targetDept = deptCheck[0].name;
      } else {
        const userCheck = await db.query('SELECT department FROM users WHERE fullName = ? OR name = ? OR email = ? LIMIT 1', [targetAllocatedTo, targetAllocatedTo, targetAllocatedTo]);
        if (userCheck.length > 0 && userCheck[0].department) {
          targetDept = userCheck[0].department;
        }
      }
    } catch (e) {
      console.warn("Department lookup error during allocation:", e);
    }

    await db.query(
      'INSERT INTO allocations (id, assetId, assetName, allocatedTo, date, status, department, requestedBy, requestedByEmail, targetRole, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [newId, assetId || null, assetName, targetAllocatedTo, date || new Date().toISOString().split('T')[0], status, targetDept, userName, userEmail, targetRole, notes || null]
    );

    if (status === 'Approved' && assetId && assetId !== 'null' && assetId !== 'Generic') {
      await db.query('UPDATE assets SET owner = ?, department = ?, status = "Active" WHERE id = ?', [targetAllocatedTo, targetDept, assetId]);
    }

    // Notify appropriate role
    if (status !== 'Approved') {
      const ntfId = 'NTF-' + Math.floor(100000 + Math.random() * 900000);
      await db.query(
        'INSERT INTO notifications (id, title, message, type, date, `read`, targetRole, targetUserEmail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [ntfId, 'New Allocation Request', `${targetAllocatedTo} requested allocation for ${assetName}.`, 'info', timeString, false, targetRole, null]
      );
    }

    // Audit Log
    console.log(JSON.stringify({
      event: 'ALLOCATION_REQUEST_CREATED',
      requestId: newId,
      createdBy: req.user.email,
      createdByName: userName,
      createdAt: timeString,
      assetId: assetId || null,
      assetName: assetName,
      allocatedTo: targetAllocatedTo
    }));

    res.status(201).json({ success: true, message: 'Allocation request created!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/assets/:id/return', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const assets = await db.query('SELECT department, owner FROM assets WHERE id = ?', [id]);
    const dept = assets.length > 0 ? assets[0].department : null;

    // Reset owner to department name if assigned to a department, keeping department intact
    await db.query(
      'UPDATE assets SET owner = ?, department = ?, status = "Active" WHERE id = ?',
      [dept || null, dept || null, id]
    );
    
    // Mark any active allocation for this asset as Returned
    await db.query('UPDATE allocations SET status = "Returned" WHERE assetId = ? AND status = "Approved"', [id]);
    
    res.json({ success: true, message: 'Asset returned to department stock successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/allocations/:id/action', authenticateToken, async (req, res) => {
  const role = req.user.role;
  const { id } = req.params;
  const { status, assetId } = req.body; // 'Approved', 'Rejected', 'Returned', optional assetId

  if (status !== 'Returned' && role !== 'Admin' && role !== 'Asset Manager' && role !== 'AssetManager' && role !== 'Department Head' && role !== 'DepartmentHead') {
    return res.status(403).json({ message: 'Access Denied: You cannot approve or reject allocation requests.' });
  }

  try {
    const allocs = await db.query('SELECT assetId, assetName, allocatedTo, requestedByEmail, department FROM allocations WHERE id = ?', [id]);
    if (allocs.length === 0) {
      return res.status(404).json({ message: 'Allocation not found.' });
    }

    const finalAssetId = assetId || allocs[0].assetId;
    const targetDept = allocs[0].department || null;

    // 1. Update allocation status
    if (status === 'Approved') {
      if (!finalAssetId) {
        return res.status(400).json({ message: 'A specific asset must be assigned to approve this request.' });
      }
      
      // Get asset name
      const assetRes = await db.query('SELECT name FROM assets WHERE id = ?', [finalAssetId]);
      const finalAssetName = assetRes.length > 0 ? assetRes[0].name : allocs[0].assetName;

      await db.query('UPDATE allocations SET status = ?, assetId = ?, assetName = ? WHERE id = ?', [status, finalAssetId, finalAssetName, id]);
      await db.query('UPDATE assets SET owner = ?, department = ?, status = "Active" WHERE id = ?', [allocs[0].allocatedTo, targetDept, finalAssetId]);
    } else if (status === 'Returned') {
      await db.query('UPDATE allocations SET status = ? WHERE id = ?', [status, id]);
      if (finalAssetId) {
        const assets = await db.query('SELECT department FROM assets WHERE id = ?', [finalAssetId]);
        const dept = (assets.length > 0 && assets[0].department) ? assets[0].department : targetDept;
        await db.query(
          'UPDATE assets SET owner = ?, department = ?, status = "Active" WHERE id = ?',
          [dept || null, dept || null, finalAssetId]
        );
      }
    } else {
      await db.query('UPDATE allocations SET status = ? WHERE id = ?', [status, id]);
    }

    // Find target user email to notify them
    const userRes = await db.query('SELECT email FROM users WHERE fullName = ?', [allocs[0].allocatedTo]);
    const targetEmail = userRes.length > 0 ? userRes[0].email : null;

    const ntfId = 'NTF-' + Math.floor(100000 + Math.random() * 900000);
    const timeString = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const displayAssetName = (status === 'Approved' && finalAssetId) ? finalAssetId : allocs[0].assetName;
    await db.query(
      'INSERT INTO notifications (id, title, message, type, date, `read`, targetRole, targetUserEmail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ntfId, `Asset Request ${status}`, `Your allocation request for "${displayAssetName}" was ${status.toLowerCase()}.`, status === 'Approved' ? 'success' : 'warning', timeString, false, null, targetEmail]
    );

    // Audit Log
    console.log(JSON.stringify({
      event: `ALLOCATION_REQUEST_${status.toUpperCase()}`,
      requestId: id,
      actionBy: req.user.email,
      actionByName: req.user.name,
      actionAt: timeString,
      status: status,
      assetId: finalAssetId,
      assetName: displayAssetName,
      allocatedTo: allocs[0].allocatedTo
    }));

    res.json({ success: true, message: `Allocation ${status.toLowerCase()} successfully!` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 5. Booking Endpoints
app.get('/api/bookings', authenticateToken, async (req, res) => {
  try {
    const bookings = await db.query(`
      SELECT b.* 
      FROM bookings b
      INNER JOIN users u ON b.bookedBy = u.fullName
      INNER JOIN assets a ON b.resourceName = a.name
    `);
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/bookings', authenticateToken, async (req, res) => {
  const { resourceName, bookedBy, date, startTime, endTime, department } = req.body;
  try {
    // Check if resource is already booked for the overlapping time slot
    const conflicts = await db.query(
      'SELECT id FROM bookings WHERE resourceName = ? AND date = ? AND status != "Cancelled" AND startTime < ? AND endTime > ?',
      [resourceName, date, endTime, startTime]
    );
    if (conflicts.length > 0) {
      return res.status(400).json({ message: `Resource "${resourceName}" is already booked for the selected time slot.` });
    }

    const countRes = await db.query('SELECT COUNT(*) as count FROM bookings');
    const count = countRes[0].count + 1;
    const newId = 'BKG-' + String(count).padStart(3, '0');

    await db.query(
      'INSERT INTO bookings (id, resourceName, bookedBy, date, startTime, endTime, status, department) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [newId, resourceName, bookedBy, date, startTime, endTime, 'Confirmed', department || req.user.department || 'IT']
    );

    // Send dynamic notification to the booking user
    const ntfId = 'NTF-' + Math.floor(100000 + Math.random() * 900000);
    const timeString = new Date().toISOString().replace('T', ' ').substring(0, 16);
    await db.query(
      'INSERT INTO notifications (id, title, message, type, date, `read`, targetRole, targetUserEmail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ntfId, 'Booking Confirmed', `Your booking for ${resourceName} on ${date} (${startTime}-${endTime}) is confirmed.`, 'success', timeString, false, null, req.user.email]
    );

    res.status(201).json({ success: true, message: 'Resource booked successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/bookings/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE bookings SET status = "Cancelled" WHERE id = ?', [id]);
    res.json({ success: true, message: 'Booking cancelled successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 6. Maintenance Endpoints
app.get('/api/maintenance', async (req, res) => {
  try {
    const logs = await db.query('SELECT * FROM maintenance');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/maintenance', authenticateToken, async (req, res) => {
  const { assetId, assetName, type, description, cost, date } = req.body;
  try {
    const countRes = await db.query('SELECT COUNT(*) as count FROM maintenance');
    const count = countRes[0].count + 1;
    const newId = 'MNT-' + String(count).padStart(3, '0');

    await db.query(
      'INSERT INTO maintenance (id, assetId, assetName, type, description, cost, date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [newId, assetId, assetName, type, description, cost, date, 'Pending']
    );

    // Also update asset status to Maintenance
    await db.query('UPDATE assets SET status = "Maintenance" WHERE id = ?', [assetId]);

    res.status(201).json({ success: true, message: 'Maintenance log added successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/maintenance/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status, cost } = req.body;
  try {
    if (cost !== undefined && cost !== null) {
      await db.query('UPDATE maintenance SET status = ?, cost = ? WHERE id = ?', [status, cost, id]);
    } else {
      await db.query('UPDATE maintenance SET status = ? WHERE id = ?', [status, id]);
    }

    // If resolved, completed, rejected, or cancelled, mark asset as Active
    if (status === 'Resolved' || status === 'Completed' || status === 'Rejected' || status === 'Cancelled') {
      const logs = await db.query('SELECT assetId FROM maintenance WHERE id = ?', [id]);
      if (logs.length > 0) {
        await db.query('UPDATE assets SET status = "Active" WHERE id = ?', [logs[0].assetId]);
      }
    }
    res.json({ success: true, message: 'Maintenance status updated!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 7. Audit Endpoints
app.get('/api/audits', async (req, res) => {
  try {
    const audits = await db.query('SELECT * FROM audits');
    res.json(audits);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/audits', authenticateToken, async (req, res) => {
  const { name, date, auditor } = req.body;
  try {
    const countRes = await db.query('SELECT COUNT(*) as count FROM audits');
    const count = countRes[0].count + 1;
    const newId = 'AUD-' + String(count).padStart(3, '0');

    await db.query(
      'INSERT INTO audits (id, name, date, auditor, progress, status) VALUES (?, ?, ?, ?, ?, ?)',
      [newId, name, date, auditor, 0, 'In Progress']
    );
    res.status(201).json({ success: true, message: 'Audit scheduled successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/audits/:id/progress', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { progress } = req.body;
  try {
    const status = progress === 100 ? 'Completed' : 'In Progress';
    await db.query('UPDATE audits SET progress = ?, status = ? WHERE id = ?', [progress, status, id]);
    res.json({ success: true, message: 'Audit progress updated!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/audits/:id/state', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const audits = await db.query('SELECT assetState FROM audits WHERE id = ?', [id]);
    if (audits.length === 0) {
      return res.status(404).json({ message: 'Audit not found.' });
    }
    const state = audits[0].assetState ? JSON.parse(audits[0].assetState) : null;
    res.json({ state });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/audits/:id/state', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { state } = req.body;
  try {
    const stateStr = state ? JSON.stringify(state) : null;
    await db.query('UPDATE audits SET assetState = ? WHERE id = ?', [stateStr, id]);
    res.json({ success: true, message: 'Audit state saved!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 8. Notification Endpoints
app.get('/api/reports/analytics', async (req, res) => {
  try {
    const assets = await db.query('SELECT * FROM assets');
    const maintenance = await db.query('SELECT * FROM maintenance');
    const bookings = await db.query('SELECT * FROM bookings');
    const allocations = await db.query('SELECT * FROM allocations');

    // 1. Total valuation & maintenance cost
    const totalValuation = assets.reduce((sum, a) => sum + (parseFloat(a.cost) || 0), 0);
    const totalMaintenanceCost = maintenance.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0);

    // 2. Department distribution
    const deptMap = {};
    assets.forEach(a => {
      const dept = a.department || 'Unassigned';
      deptMap[dept] = (deptMap[dept] || 0) + 1;
    });

    // 3. Status distribution
    const statusMap = {};
    assets.forEach(a => {
      const st = a.status || 'Active';
      statusMap[st] = (statusMap[st] || 0) + 1;
    });

    // 4. Most used assets / resources (from bookings & allocations)
    const usageMap = {};
    bookings.forEach(b => {
      if (b.resourceName && b.status === 'Confirmed') {
        usageMap[b.resourceName] = (usageMap[b.resourceName] || 0) + 1;
      }
    });
    allocations.forEach(al => {
      if (al.assetName) {
        usageMap[al.assetName] = (usageMap[al.assetName] || 0) + 1;
      }
    });

    const mostUsedList = Object.keys(usageMap)
      .map(name => ({ name, count: usageMap[name] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 5. Idle assets (In stock, no owner)
    const idleList = assets
      .filter(a => !a.owner && a.status !== 'Disposed')
      .slice(0, 5)
      .map(a => ({ id: a.id, name: a.name, location: a.location || 'Central Stock' }));

    res.json({
      totalValuation,
      totalMaintenanceCost,
      totalAssetsCount: assets.length,
      deptDistribution: deptMap,
      statusDistribution: statusMap,
      mostUsedList,
      idleList
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await db.query(
      'SELECT * FROM notifications WHERE (targetRole IS NULL AND targetUserEmail IS NULL) OR targetRole = ? OR targetUserEmail = ? ORDER BY date DESC',
      [req.user.role, req.user.email]
    );
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/notifications', authenticateToken, async (req, res) => {
  const { title, message, type, targetRole, targetUserEmail } = req.body;
  if (req.user.role !== 'Admin' && req.user.role !== 'Asset Manager') {
    return res.status(403).json({ message: 'Access Denied: Only Admins or Asset Managers can send notifications.' });
  }
  if (!title || !message) {
    return res.status(400).json({ message: 'Title and message are required.' });
  }
  try {
    const ntfId = 'NTF-' + Math.floor(100000 + Math.random() * 900000);
    const timeString = new Date().toISOString().replace('T', ' ').substring(0, 16);
    await db.query(
      'INSERT INTO notifications (id, title, message, type, date, `read`, targetRole, targetUserEmail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ntfId, title, message, type || 'info', timeString, false, targetRole || null, targetUserEmail || null]
    );
    res.status(201).json({ success: true, message: 'Notification sent successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE notifications SET `read` = TRUE WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/notifications', authenticateToken, async (req, res) => {
  try {
    // Delete only user's notifications or all if admin
    if (req.user.role === 'Admin') {
      await db.query('DELETE FROM notifications');
    } else {
      await db.query('DELETE FROM notifications WHERE targetUserEmail = ?', [req.user.email]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 9. Profile & Settings Endpoints
app.put('/api/profile', authenticateToken, async (req, res) => {
  const { fullName, department, avatar } = req.body;
  try {
    if (avatar !== undefined) {
      await db.query(
        'UPDATE users SET fullName = COALESCE(?, fullName), department = COALESCE(?, department), avatar = ? WHERE email = ?',
        [fullName || null, department || null, avatar, req.user.email]
      );
    } else {
      await db.query(
        'UPDATE users SET fullName = COALESCE(?, fullName), department = COALESCE(?, department) WHERE email = ?',
        [fullName || null, department || null, req.user.email]
      );
    }
    const updated = await db.query('SELECT email, fullName, role, department, avatar FROM users WHERE email = ?', [req.user.email]);
    
    const userPayload = {
      email: updated[0].email,
      name: updated[0].fullName,
      role: updated[0].role,
      department: updated[0].department,
      avatar: updated[0].avatar
    };
    res.json({ success: true, user: userPayload, message: 'Profile updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/profile/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const users = await db.query('SELECT password FROM users WHERE email = ?', [req.user.email]);
    if (users.length === 0 || users[0].password !== currentPassword) {
      return res.status(400).json({ message: 'Current password does not match.' });
    }
    await db.query('UPDATE users SET password = ? WHERE email = ?', [newPassword, req.user.email]);
    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 10. User Management Endpoints
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await db.query('SELECT email, fullName, role, department, avatar, status, transitionDetails FROM users');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/users/role', authenticateToken, async (req, res) => {
  const { email, role, department, oldHeadEmail, oldHeadStatus, oldHeadDetails } = req.body;
  try {
    // If setting a new Department Head
    if (role === 'Department Head') {
      if (oldHeadEmail) {
        const finalStatus = oldHeadStatus || 'Employee';
        const finalDetails = oldHeadDetails || null;
        
        if (finalStatus === 'Retired' || finalStatus === 'Resigned') {
          await db.query(
            'UPDATE users SET role = "Employee", status = ?, transitionDetails = ? WHERE email = ?',
            [finalStatus, finalDetails, oldHeadEmail]
          );
        } else if (finalStatus === 'Transferred') {
          await db.query(
            'UPDATE users SET role = "Employee", status = "Transferred", transitionDetails = ? WHERE email = ?',
            [finalDetails, oldHeadEmail]
          );
        } else {
          await db.query(
            'UPDATE users SET role = "Employee", status = "Active", transitionDetails = ? WHERE email = ?',
            [finalDetails, oldHeadEmail]
          );
        }
      } else {
        // Fallback: Demote existing head in that department to Employee silently
        await db.query('UPDATE users SET role = "Employee", status = "Active" WHERE department = ? AND role = "Department Head"', [department]);
      }
    }
    await db.query('UPDATE users SET role = ?, department = ?, status = "Active" WHERE email = ?', [role, department, email]);
    res.json({ success: true, message: 'User role and department updated!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
