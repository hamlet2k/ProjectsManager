# Project Context
The repository is called **ProjectsManager**.  
It is a web application built with **Python (Flask)** that allows a group (family, small team) to create projects and track them.

## Current Stack and Structure
- **Backend**: Flask + Flask-Migrate for database management.
- **Main languages**: Python (~48%), HTML (~51%), Mako.
- **Key files**:
  - `app.py` (app entry point, main route definitions).
  - `database.py` (database connection and initialization).
  - `forms.py` (forms with validations).
  - `models/` (classes representing database tables).
  - `migrations/` (schema migration scripts with Alembic/Flask-Migrate).
  - `templates/` (HTML templates).
  - `static/` (CSS, JS, images).
  - `requirements.txt` (dependencies).
- **Current execution**:
  1. Create a virtual environment.
  2. Install dependencies: `pip install -r requirements.txt`.
  3. Migrations: `flask db init && flask db migrate && flask db upgrade`.
  4. Run: `flask run`.

## Expected Functionality
- Project CRUD: create, list, edit, delete.
- Use of web forms.
- Persistence with a relational database.
- Web interface with HTML templates.

## Update Objectives (initial version)
1. Review and document available **endpoints** (what routes exist, what each does).
2. Review and document **data models** (entities, attributes, and relationships).
3. Modernize the structure: use **Blueprints** to organize modules.
4. Improve forms with more robust validations.
5. Evaluate implementation of **user authentication** (login/logout, roles).
6. Prepare the app for modern deployment: configuration via `.env`, possible Dockerfile.
7. Enhance template design (Bootstrap or another CSS framework).

## Work Guidelines
- Always show updated code in complete blocks.
- Briefly explain changes and their purpose.
- Maintain compatibility with Flask-Migrate.
- Optimize for clarity and scalability.

This context will be updated as tasks progress.