# AssetFlow - Modern IT & Asset Management ERP

AssetFlow is a responsive, full-stack enterprise resource planning (ERP) system designed for operations teams to track hardware inventory, manage software licenses, schedule audits, coordinate resource bookings (such as conference rooms and company vehicles), and log maintenance records.

It features a modern, premium design built using standard HTML5/CSS3/JS, styled with **Bootstrap 5**, and connected to a robust **Node.js/Express** backend backed by a fully persistent **MySQL** database.

---

## 🚀 Key Features

1. **Role-Based Access Control (RBAC)**:
   - Customized dashboards, navigation, and permissions for **Admins**, **Asset Managers**, **Department Heads**, and **Employees**.
2. **Enterprise Persistent Data Architecture**:
   - 100% data persistence using MySQL. All application state, from user accounts to verification logs, is securely stored.
   - Dynamic empty states replace hardcoded mock data for a clean, production-ready experience.
3. **Advanced User & Organization Management**:
   - Admins can register new users (Asset Managers, Dept Heads, Employees) directly from the dashboard.
   - **Department Head Transitions**: Assigning a new department head prompts the Admin to specify the old head's status (Retired, Transferred, Demoted, Resigned), maintaining a clear audit log of "Former Department Heads & Alumni."
4. **Tiered Asset Tracking & Allocations**:
   - Comprehensive asset lifecycle management (Create, Update, Return, Delete).
   - **Multi-Level Approval Workflow**: Employee requests route to Department Heads. Department Head requests route to Asset Managers.
5. **Resource Bookings & Calendar**:
   - Check room/vehicle availability and book with overlapping time conflict prevention.
   - FullCalendar integration with detailed event rendering (time slot, resource name, booker).
6. **Maintenance & Auditing**:
   - Schedule hardware/software audits, manage maintenance repair cost logs, and track real-time audit verification states directly in the database.
7. **Secure Login & Authentication**:
   - JWT-based authentication.
   - Demo autocomplete options are provided for email convenience, but require manual password input to prevent automated bypasses.

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+), Bootstrap 5, Axios, SweetAlert2, FullCalendar
- **Backend**: Node.js, Express.js, JSON Web Tokens (JWT)
- **Database**: MySQL (with automated table creation, migration, and seeding)

---

## 📂 Project Structure

```
├── assetflow/
│   ├── backend/
│   │   ├── db.js          # Database setup, persistent tables schema & seeder logic
│   │   ├── server.js      # Express application, routes, auth middlewares, business logic
│   │   ├── package.json   # Node server dependencies
│   │   └── .env           # Environment configurations (DB connection, JWT secret)
│   │
│   └── frontend/
│       ├── index.html     # Landing Page
│       ├── assets/
│       │   ├── css/       # Premium style tokens and custom CSS
│       │   └── js/        # api.js, auth.js, org-setup.js and routing logic
│       └── pages/
│           ├── login.html
│           ├── dashboard.html
│           ├── org-setup.html
│           └── ... (allocation, booking, maintenance, reports pages)
└── README.md              # Main Documentation
```

---

## ⚙️ Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) installed.
- [MySQL Server](https://www.mysql.com/) installed and running locally.

### 1. Configure Backend Environment
Navigate to the backend directory and configure the environment variables:
```bash
cd assetflow/backend
```
Create or edit the `.env` file (you can use `.env-example` as a template):
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=assetflow_db
JWT_SECRET=assetflow_super_secret_key_123!
```
*Make sure your MySQL server is running and the credentials match.*

### 2. Run the Backend Server
Install dependencies and start the server:
```bash
npm install
npm start
```
*Note: Upon startup, the server will automatically connect to MySQL, create the `assetflow_db` database, initialize the tables for persistence, and seed them with required default master data.*

### 3. Open the Frontend
Since the frontend consists of static HTML/JS/CSS files, you can open `assetflow/frontend/index.html` directly in your browser, or use a local HTTP server such as VS Code's **Live Server** extension for the best experience.

---

## 🔑 Default Credentials

Upon initialization, only the default **Admin** account is seeded into the database. All other users (Asset Managers, Department Heads, Employees) must be securely registered by the Admin via the Organization Setup dashboard.

| User Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@assetflow.com` | `Password123!` | Org configuration, department management, user registration, promotions |

---

## 🛡️ Database Reset & Cleanup
For development and demonstration purposes, if you need to wipe all data and return to a clean state, an Admin user can use the **Reset Database** functionality located within the Admin Settings / Org Setup page. This will drop all tables and re-seed the default data cleanly.
