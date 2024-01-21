# Projects Manager
Application to create projects and track them

## Local Installation Instructions

There is no release or package of the application yet.
In case you want to test the application in the curretn state, or you want to collaborate with development:
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

### 4. Initialize the Database

Before running the application, initialize the database using Flask-Migrate. This step assumes you have set up your database configurations correctly in your application settings.
```bash
flask db init
flask db migrate -m "Initial migration"
flask db upgrade
```

### 5. Run the Application

Now, you can run the application using:
```bash
flask run
```

The application should now be running and accessible via `http://localhost:5000` (or the port you have configured).

### Additional Notes

- Ensure you have Python 3.x installed, as this application is compatible with Python 3.
- Always activate the virtual environment (`source .venv/bin/activate` on macOS/Linux or `.venv\Scripts\activate` on Windows) before running the application to ensure you are using the correct dependencies.
- For production deployment, additional steps for server setup, environment configuration, and security considerations will be necessary.
