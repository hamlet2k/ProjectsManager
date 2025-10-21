# Projects Manager
Application to create projects and track them

## Local Installation Instructions

There is no release or package of the application yet.
In case you want to test the application locally, or you want to collaborate with development:
This are the instructions to run the application locally.

To set up and run this Python application, please follow the steps below:

### 1. Clone the Repository

First, clone the repository to your local machine using Git. 
```bash
git clone https://github.com/hamlet2k/ProjectsManager.git
cd ProjectsManager
```

### 2. Set Up a Virtual Environment (Optional but Recommended)

It's a good practice to use a virtual environment to manage dependencies for your project. This keeps your project's dependencies separate from your system's Python installation. If you don't have `virtualenv` installed, first install it using pip:

```bash
pip install virtualenv
```

Then, create and activate a virtual environment in the project directory:

**For Windows:**

```bash
virtualenv .venv
.venv\Scripts\activate
```

**For macOS and Linux:**
```bash
virtualenv .venv
source .venv/bin/activate
```

### 3. Install Required Packages

Install all the required packages using `pip` and the provided `requirements.txt` file:
```bash
pip install -r requirements.txt
```

### 4. Configure PostgreSQL

The application expects a PostgreSQL database. Create (or reuse) any database that
fits your environment and store the connection details in `.env` file at the project root (create it if it doesn't exist):

1. Copy the example values and update them with your credentials:
   ```bash
   DATABASE_URL=postgresql://<username>:<password>@<host>:<port>/<database>
   ```
   You can keep passwords out of the string if your PostgreSQL instance uses trust
   authentication (e.g., `postgresql://localhost:5432/projectsmanager`).
2. (Optional) If you run the test suite against a local PostgreSQL server, add an
   admin connection string so the tests can create disposable databases:
   ```bash
   TEST_DATABASE_ADMIN_URL=postgresql://<admin-user>:<admin-password>@<host>:<port>/postgres
   ```

The application uses `python-dotenv` to load `.env` automatically, so there is no
need to export these variables manually.

### 5. Initialize the Database

Before running the application, initialize the database using Flask-Migrate. This step assumes you have set up your database configurations correctly in your application settings.
```bash
flask db init
flask db migrate -m "Initial migration"
flask db upgrade
```

If you ever restore data manually (for example from the legacy SQLite file),
reset the PostgreSQL sequences so new rows get non-conflicting primary keys:
```bash
# macOS/Linux
psql "$DATABASE_URL" -f tools/reset_sequences.sql
# Windows (PowerShell)
psql $env:DATABASE_URL -f tools/reset_sequences.sql
```

### 6. Keep PostgreSQL and SQLite Databases Aligned

You can develop against SQLite but still deploy on PostgreSQL. After adding a migration:

1. Upgrade PostgreSQL (ensure `DATABASE_URL` points at it):
   ```bash
   flask db upgrade
   psql "$DATABASE_URL" -c "select version_num from alembic_version;"
   ```
2. Upgrade SQLite (temporarily clear `DATABASE_URL`):
   ```bash
   unset DATABASE_URL         # bash/zsh
   set DATABASE_URL=          # PowerShell/CMD
   flask db upgrade
   sqlite3 instance/projectsmanager.db "select version_num from alembic_version;"
   ```
3. Restore your usual `DATABASE_URL` setting.

Whenever you import data into PostgreSQL manually, re-run `tools/reset_sequences.sql`
so inserts keep working.

### 7. Run the Application

Now, you can run the application using:
```bash
flask run
```

The application should now be running and accessible via `http://localhost:5000` (or the port you have configured).

### Additional Notes

- Ensure you have Python 3.x installed, as this application is compatible with Python 3.
- Always activate the virtual environment (`source .venv/bin/activate` on macOS/Linux or `.venv\Scripts\activate` on Windows) before running the application to ensure you are using the correct dependencies.
- For production deployment, additional steps for server setup, environment configuration, and security considerations will be necessary.
