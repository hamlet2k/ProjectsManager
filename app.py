from datetime import datetime
from functools import wraps

from flask import (
    Flask,
    flash,
    jsonify,
    session,
    request,
    render_template,
    redirect,
    url_for,
    g,
)
from flask.cli import with_appcontext

from flask_migrate import Migrate
import click
from wtforms import DateTimeLocalField, IntegerField, StringField

from sqlalchemy.exc import SQLAlchemyError
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
from models.task import Task
from models.user import User

from forms import ScopeForm, SignupForm, LoginForm, UserSettingsForm, THEME_CHOICES

# Create flask command lines to update the db based on the model
# Useage:
# Create a migration script in ./migrations/versions
# > flask db migrate -m "Update comments"
# Run the update
# > flask db upgrade
migrate = Migrate(app, db)

# User Authentication
# ------------------------------
login_exempt_routes = ["login", "logout", "signup", "static", "change_theme"]


@app.before_request
def require_login():
    """All routes require a User logged in, except the ones listed in login_exempt_routes

    This method excecutes before every request and checks if there is a user_id
    stored in session. If so, it sets the g.user that contains the object User which
    can be used in the subsecuent method.

    Returns:
        Redirects to the login page if no user is found in session
    """
    user_id = session.get("user_id")
    if user_id:
        g.user = User.query.get(user_id)
    else:
        g.user = None
        if request.endpoint and request.endpoint not in login_exempt_routes:
            flash("Please login", "info")
            return redirect(url_for("login", next=request.url))


def requires_role(role):
    """Requires a specific User role for the route to be accessed

    Decorator that can be specified in any route to require a User.role
    Roles are defined in the User model.
    Usage:
        @app.route('/admin-dashboard') # Flask route\n
        @requires_role(User.ADMIN)     # Specifies the User.role required\n
        def admin_dashboard():         # Method definition\n
            # Admin only content       # Method logic\n

    Arguments:
        role -- Constant in User model (User.ADMIN | User.USER)
    """

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if g.user is None or g.user.role != role:
                flash("You do not have access to this page.", "warning")
                return redirect(url_for("home"))
            return f(*args, **kwargs)

        return decorated_function

    return decorator


@app.context_processor
def inject_forms():
    """Injects forms to the template for every method

    Returns:
        Dictionary listing the forms available in templates
    """
    return {"login_form": LoginForm()}


def authenticate_user(username, password):
    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        session["user_id"] = user.id
        session["user"] = user.name
        session["theme"] = user.theme
        return True
    return False


@app.route("/login", methods=["GET", "POST"])
def login():
    """
    Handle the login functionality.

    This function is responsible for handling the login functionality. It receives
    HTTP requests to the '/login' endpoint and supports both GET and POST methods.

    Parameters:
        None

    Returns:
        The rendered login page template with the login form.

    Raises:
        None
    """
    login_form = LoginForm()
    if login_form.validate_on_submit():
        # Replace with your user authentication logic
        if authenticate_user(login_form.username.data, login_form.password.data):
            return redirect(url_for("home"))  # Redirect to the main page after login
        else:
            flash("Invalid username or password", "danger")
    return render_template("login.html", login_form=login_form)


@app.route("/logout")
def logout():
    session.pop("user", None)
    session.pop("user_id", None)
    session.pop("selected_scope", None)
    g.user = None
    return redirect(url_for("login"))


@app.route("/signup", methods=["GET", "POST"])
def signup():
    signup_form = SignupForm()
    if signup_form.validate_on_submit():
        user = User(
            username=signup_form.username.data,
            name=signup_form.name.data,
            email=signup_form.email.data,
        )
        user.set_password(signup_form.password.data)
        try:
            db.session.add(user)
            db.session.commit()
            flash("Registration successful! You can now log in.", "success")
            return redirect(url_for("login"))
        except SQLAlchemyError as e:
            db.session.rollback()  # Roll back the transaction
            flash(f"An error occurred: {str(e)}", "error")
    return render_template("signup.html", signup_form=signup_form)


@app.route("/user", methods=["GET", "POST"])
def user():
    """User settings page"""
    user_form = UserSettingsForm(obj=g.user)

    if user_form.validate_on_submit():
        g.user.username = user_form.username.data
        g.user.name = user_form.name.data
        g.user.email = user_form.email.data
        g.user.theme = user_form.theme.data
        g.user.role = user_form.role.data
        g.user.set_password(user_form.password.data)
        try:
            db.session.commit()
            flash("Information Updated", "success")
            return redirect(url_for("home"))
        except SQLAlchemyError as e:
            db.session.rollback()  # Roll back the transaction
            flash(f"An error occurred: {str(e)}", "error")

    # user_form.theme.choices = THEME_CHOICES
    # user_form.role.choices = [(User.USER,'System User'),(User.ADMIN, 'Administrator')]

    return render_template("user.html", user_form=user_form)


# Nav Menu
# ------------------------------
class CrudItem:
    """CrudItem Class"""

    def __init__(self, name, route, item_type="", display=True):
        self.name = name
        self.route = route
        self.item_type = item_type
        self.display = display

    def get_link(self):
        """generate the link based on the route"""
        if self.item_type:
            return url_for(self.route, item_type=self.item_type)
        return url_for(self.route)

    def __repr__(self) -> str:
        return self.get_link()


def get_crud_items(**kwargs):
    """Crud helper utility to determine the crud items, type and action based on URL

    It help to retrieve from the Templates the action and type of crud object
    It dynamically captures the type and action from the active URL
    It can be overriden by passsing {params} to the Template

    Returns:
        the list of crud items - the crud items matching the url - the action matching the url
    """
    crud_items = [
        CrudItem("Group", "items", "scope"),
        CrudItem("Project", "items", "task"),
    ]

    def get_url_item(**kwargs):
        item_type = kwargs.get("item_type") or None
        path_segments = request.path.split("/")
        # Assuming URL structure is /items/<item_type>
        if not item_type and len(path_segments) > 2:
            item_type = path_segments[2]
        return next((item for item in crud_items if item.item_type == item_type), None)

    def get_url_action(**kwargs):
        action = kwargs.get("action") or None
        path_segments = request.path.split("/")
        if not action and len(path_segments) > 3:
            action = path_segments[3]
        return action if action in ("add", "edit") else "no-action"

    return crud_items, get_url_item, get_url_action


@app.context_processor
def inject_crud_items():
    """It makes the crud helper utility available to all templates

    Returns:
        list of crud items - crud items matching the url - action matching the url
    """
    crud_items, get_url_item, get_url_action = get_crud_items()
    return {
        "menus": crud_items,
        "get_current_menu": get_url_item,
        "get_current_action": get_url_action,
    }


# Themes
# ------------------------------


def set_theme(selected_theme: str) -> bool:
    """
    Sets the theme for the application.

    Parameters:
        selected_theme (str): The theme to be set.

    Returns:
        bool: True if the theme is successfully set, False otherwise.
    """
    theme_names = [theme[0] for theme in THEME_CHOICES]

    if selected_theme in theme_names:
        if g.user:
            g.user.theme = selected_theme
            try:
                db.session.commit()
            except SQLAlchemyError as e:
                db.session.rollback()
                flash(f"An error occurred: {str(e)}", "error")
                return False
        session["theme"] = selected_theme
        return True
    return False


@app.route("/change_theme/<string:theme>")
def change_theme(theme):
    """
    Change the theme of the application.

    Parameters:
        theme (str): The name of the theme to change to.

    Returns:
        redirect: Redirects to the previous page or the home page.

    Raises:
        flash: Raises a flash message if an invalid theme is provided.
    """
    if not set_theme(theme):
        flash("Invalid theme", "error")
    return redirect(request.referrer or url_for("home"))


# Custom form validators
# ------------------------------
def dateformat(value, format="%Y-%m-%dT%H:%M"):
    if value is None:
        return ""
    return value.strftime(format)


app.jinja_env.filters["dateformat"] = dateformat


# Home
# ------------------------------
@app.route("/")
def home():
    items_list = g.user.owned_scopes + g.user.scopes
    form = ScopeForm()
    params = {"item_type": "scope", "action": "add"}
    items_data = [get_data_attributes(item, form) for item in items_list]
    return render_template(
        "home.html",
        items=items_list,
        form=form,
        params=params,
        items_data=items_data,
        zip=zip,
    )


# Scopes
# ------------------------------
# scope_exempt_routes = ["home", "scope", "user"] + login_exempt_routes


# @app.before_request
# def require_scope():
#     scope_selected = session.get("selected_scope")
#     if scope_selected:
#         g.scope = Scope.query.get(scope_selected)
#     else:
#         g.scope = None
#         if request.endpoint and request.endpoint not in scope_exempt_routes:
#             flash("Please select a scope", "info")
#             return redirect(url_for("home"))


def scope_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not g.scope:
            flash("Please select a scope", "warning")
            return redirect(request.referrer or url_for("home"))
        return f(*args, **kwargs)

    return decorated_function


def set_scope(scope_id):
    """Store selected scope in session"""
    session["selected_scope"] = scope_id


def get_scope():
    """Retrieve the user scope from session"""
    return session.get("selected_scope")


@app.route("/scope/<int:id>")
def scope(id):
    set_scope(id)
    return redirect(url_for("tasks"))


@app.route("/tasks")
@scope_required
def tasks():
    tasks_list = g.scope.tasks
    return "list of tasks"


@app.route("/update_scope_rank", methods=["POST"])
def update_scope_rank():
    items = request.json["items"]
    for data in items:
        item = Scope.query.get(data["id"])
        item.rank = data["newRank"]
        db.session.commit()
    return jsonify({"success": True})


# @app.route('/some/path')
# def my_view_function():
#     breadcrumbs = [
#         {"text": "Home", "url": url_for('home')},
#         {"text": "Library", "url": url_for('library')},
#         {"text": "Data", "url": None}  # Current page
#     ]
#     return render_template('my_template.html', breadcrumbs=breadcrumbs)

# CRUD
# ------------------------------


@app.context_processor
def inject_default_params():
    """
    Injects and empty params dictionary

    The CRUD operation by default uses the URL to determine the item_type and action
    When the aplication needs to force an item_type or an action, it can be passed to
    the template in the params dictionary
    """
    return {"params": {}}


def get_form_class(item_type):
    item_class_name = (
        item_type.capitalize()
    )  # TODO: This may need to be adjusted for CamelCase
    item_form_class = globals().get(item_class_name + "Form")
    if not item_form_class:
        raise ValueError(f"Form class for '{item_type}' not found")
    return item_form_class


def get_class(item_type):
    item_class_name = (
        item_type.capitalize()
    )  # TODO: This may need to be adjusted for CamelCase
    item_class = globals().get(item_class_name)
    if not item_class:
        raise ValueError(f"Model class for '{item_type}' not found")
    return item_class


def get_items(item_type):
    item_class_name = (
        item_type.capitalize()
    )  # TODO: This may need to be adjusted for CamelCase
    item_class = globals().get(item_class_name)
    if not item_class:
        return "Form not found", 404
    return item_class.query.all()


def get_data_attributes(item, form):
    data_attrs = {}
    for field_name, field_object in form._fields.items():
        field_value = getattr(item, field_name, None)
        if field_value is None and hasattr(field_object, "default"):
            field_value = field_object.default
        if field_value and isinstance(field_value, datetime):
            field_value = field_value.isoformat()  # Format datetime for HTML
        data_attrs["data-item-" + field_name] = field_value or ""
    return data_attrs


@app.route("/items/<string:item_type>")
@requires_role(User.ADMIN)
def items(item_type):
    try:
        items_list = get_items(item_type)
        form_class = get_form_class(item_type)
        form = form_class()
        items_data = [get_data_attributes(item, form) for item in items_list]
    except ValueError as e:
        return str(e), 404

    return render_template(
        "items.html", form=form, items=items_list, items_data=items_data, zip=zip
    )


@app.route("/items/<string:item_type>/add", methods=["GET", "POST"])
def add_item(item_type, template=None):
    try:
        item_class = get_class(item_type)
        item = item_class()
        form_class = get_form_class(item_type)
        form = form_class()
        items_list = get_items(item_type)
    except ValueError as e:
        return str(e), 404

    # endpoint = url_for('items', item_type=item_type)

    show_modal = False

    if form.validate_on_submit():
        # Find the highest rank
        max_rank = item_class.query.order_by(item_class.rank.desc()).first()
        new_rank = 1 if max_rank is None else max_rank.rank + 1
        item.rank = new_rank

        item.start_date = datetime.fromisoformat(
            datetime.utcnow().strftime("%Y-%m-%dT%H:%M")
        )
        item.owner_id = session.get("user_id")

        for field_name, field_object in form._fields.items():
            # Check if the attribute exists in the item and skip CSRF token field
            if hasattr(item, field_name) and field_name != "csrf_token":
                # Handle different field types here
                if isinstance(item, DateTimeLocalField):
                    setattr(item, field_name, field_object.data)
                else:
                    setattr(item, field_name, field_object.data)
                # Add more elif blocks for other field types as needed
        try:
            db.session.add(item)
            db.session.commit()
            flash(item_type + " added!", "success")
            form = form_class()
        except SQLAlchemyError as e:
            db.session.rollback()
            flash(f"An error occurred: {str(e)}", "error")
        return redirect(request.referrer or url_for("home"))
    else:
        show_modal = True
    # TODO: This needs to be tested
    return render_template(
        template or "items.html", form=form, show_modal=show_modal, items=items_list
    )


@app.route("/items/<string:item_type>/edit/<int:id>", methods=["GET", "POST"])
def edit_item(item_type, id, template=None):
    try:
        item_class = get_class(item_type)
        item = item_class.query.get_or_404(id)
        form_class = get_form_class(item_type)
        form = form_class(obj=item)
        items_list = get_items(item_type)
    except ValueError as e:
        return str(e), 404

    show_modal = False

    if form.validate_on_submit():
        for field_name, field_object in form._fields.items():
            # Check if the attribute exists in the item and skip CSRF token field
            if hasattr(item, field_name) and field_name != "csrf_token":
                if isinstance(item, DateTimeLocalField):
                    setattr(item, field_name, field_object.data)
                else:
                    setattr(item, field_name, field_object.data)
        try:
            db.session.commit()
            flash(item_type + " edited!", "success")
            form = form_class()
        except SQLAlchemyError as e:
            db.session.rollback()
            flash(f"An error occurred: {str(e)}", "error")
        
    else:
        show_modal = True
    # TODO: This needs to be tested
    return render_template(template or "items.html", form=form, show_modal=show_modal, items=items_list)


@app.route("/items/<string:item_type>/delete/<int:id>", methods=["POST"])
def delete_item(item_type, id, template=None):
    try:
        item_class = get_class(item_type)
        item = item_class.query.get_or_404(id)
        db.session.delete(item)
        db.session.commit()
    except ValueError as e:
        return str(e), 404
    endpoint = template or request.referrer or url_for("items", item_type=item_type) or url_for("home")
    print(endpoint)
    return redirect(endpoint)


@app.route("/items/<string:item_type>/rank", methods=["POST"])
def update_item_rank(item_type):
    items_list = request.json["items"]
    for data in items_list:
        try:
            item_class = get_class(item_type)
            item = item_class.query.get_or_404(data["id"])
            item.rank = data["newRank"]
            db.session.commit()
        except ValueError as e:
            return str(e), 404
    return jsonify({"success": True})


# Developer Tools
# ------------------------------
@app.cli.command("reset-db")
@with_appcontext
def reset_db_command():
    """Enables a console commmand to recreate the db.

    Usage: flask reset-db
    """
    db.drop_all()
    db.create_all()
    click.echo("Database has been reset.")


@app.route("/delete_session_var/<string:var>")
@requires_role(User.ADMIN)
def delete_session_var(var):
    session.pop(var)
    return redirect(request.referrer or url_for("home"))


@app.route("/reset-db", methods=["GET", "POST"])
@requires_role(User.ADMIN)
def reset_db():
    """Drops and recreates all tables in the database."""
    with app.app_context():
        db.drop_all()
        db.create_all()
    print("Database has been reset.")
    return redirect(url_for("home"))


# Application Execution
# ------------------------------
if __name__ == "__main__":
    app.run(debug=True)
    # app.run(host='0.0.0.0',port=5000)
