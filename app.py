from flask import Flask, jsonify, session, request, render_template, redirect, url_for
from flask.cli import with_appcontext
import click
from forms import ScopeForm, SearchForm, ResetDbForm
from database import db

# Initialize Flask app
app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///projectsmanager.db"
# TODO: Add secret as an enviroment variable and replace
# app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default_secret_key')
app.config[
    "SECRET_KEY"
] = b"t\xbc5\xa6\xdb~\xc2dj~\x1e^6\xdaN\x98<\x80\xf1TI\xb0\x9c\x9f"

db.init_app(app)

# Models import should be after initializing db
from models.scope import Scope
from models.project import Project
from models.task import Task


# ------------------------------
# Filters
# ------------------------------
@app.context_processor
def inject_forms():
    return {"search_form": SearchForm(), "reset_db_form": ResetDbForm()}


# ------------------------------
# Define routes
# ------------------------------
@app.route("/")
def home():
    scopes = Scope.query.all()
    return render_template("home.html", scopes=scopes)


@app.route("/search", methods=["GET", "POST"])
def search():
    form = SearchForm()
    if form.validate_on_submit():
        # Process the search
        return redirect(url_for("search_results", query=form.search.data))
    # Render a template or redirect as necessary


@app.route("/search-results")
def search_results():
    return render_template("home.html")


@app.route("/projects")
def projects():
    projects = Project.query.all()
    return render_template("projects.html", projects=projects)


@app.route("/tasks")
def tasks():
    return "List of tasks will be displayed here."


@app.route("/scope/<int:scope_id>")
def scope(scope_id):
    set_scope(scope_id)
    return redirect(url_for("projects"))


@app.route('/add_scope', methods=['GET', 'POST'])
def add_scope():
    scope_form = ScopeForm()
    if scope_form.validate_on_submit():
        # Find the highest rank
        max_rank = Scope.query.order_by(Scope.rank.desc()).first()
        new_rank = 1 if max_rank is None else max_rank.rank + 1

        # Create a new scope with the next rank
        new_scope = Scope(name=scope_form.name.data, rank=new_rank)
        db.session.add(new_scope)
        db.session.commit()

        return redirect(url_for('scopes'))
    return render_template('add_scope.html', scope_form=scope_form)

@app.route("/scopes/edit/<int:scope_id>", methods=["GET", "POST"])
def edit_scope(scope_id):
    scope = Scope.query.get_or_404(scope_id)
    scope_form = ScopeForm(obj=scope)
    if scope_form.validate_on_submit():
        scope.name = request.form["name"]
        db.session.commit()
        return redirect(url_for("scopes"))
    scopes = Scope.query.all()
    return render_template("scopes.html", scope_form=scope_form)


@app.route("/scopes", methods=["GET", "POST"])
def scopes():
    scope_form = ScopeForm()
    scopes = Scope.query.all()
    return render_template("scopes.html", scope_form=scope_form, scopes=scopes)


@app.route("/scopes/delete/<int:scope_id>", methods=["POST"])
def delete_scope(scope_id):
    scope = Scope.query.get_or_404(scope_id)
    db.session.delete(scope)
    db.session.commit()
    return redirect(url_for("scopes"))


@app.route("/update_scope_rank", methods=["POST"])
def update_scope_rank():
    scopes_data = request.json["scopes"]
    for scope_data in scopes_data:
        scope = Scope.query.get(scope_data["id"])
        scope.rank = scope_data["newRank"]
        db.session.commit()
    return jsonify({"success": True})


@app.route("/reset-db", methods=["POST"])
def reset_db():
    # Function to reset the database
    reset_database()
    return redirect(url_for("home"))  # Redirect to a safe page after resetting


# ------------------------------
# App Functions
# ------------------------------


def set_scope(scope_id):
    """Store selected scope in session"""
    session["selected_scope"] = scope_id


def get_scope():
    """Retrieve the user scope from session"""
    return session.get("selected_scope")


# Reset database runtime
def reset_database():
    """
    Drops and recreates all tables in the database.
    """
    with app.app_context():
        # Drop all tables
        db.drop_all()

        # Recreate all tables
        db.create_all()

    print("Database has been reset.")


# Reset database flask command
@app.cli.command("reset-db")
@with_appcontext
def reset_db_command():
    """Clear the existing data and create new tables."""
    db.drop_all()
    db.create_all()
    click.echo("Database has been reset.")


# Run the Flask application
if __name__ == "__main__":
    app.run(debug=True)
