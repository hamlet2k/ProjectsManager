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

from flask_migrate import Migrate

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

from forms import ScopeForm, TaskForm,SignupForm, LoginForm, UserSettingsForm, THEME_CHOICES

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
    return redirect(url_for("scope"))


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




# Scopes
# ------------------------------
@app.before_request
def load_scope():
    scope_selected = session.get("selected_scope")
    if scope_selected:
        g.scope = Scope.query.get(scope_selected)
    else:
        g.scope = None

def scope_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not g.scope:
            flash("Please select a scope", "warning")
            return redirect(request.referrer or url_for("home"))
        return f(*args, **kwargs)
    return decorated_function


@app.route("/scope/<int:id>")
def set_scope(id):
    session["selected_scope"] = id
    return redirect(url_for("task"))


@app.route("/scope")
def scope():
    items = g.user.owned_scopes + g.user.scopes
    items.sort(key=lambda item: item.rank)
    form = ScopeForm()
    session.pop("selected_scope", None)
    g.scope = None
    return render_template("scope.html", scopes=items, scope_form=form)

@app.route("/task")
@scope_required
def task():
    show_completed = request.args.get('show_completed', 'false').lower() == 'true'
    items = [task for task in g.scope.tasks if show_completed or not task.completed]
    items.sort(key=lambda item: item.rank)
    form = TaskForm()
    return render_template("task.html", tasks=items, task_form=form, scope=g.scope, show_completed=show_completed)

def get_max_rank(item_type):
    try:
        # TODO: This may need to be adjusted for CamelCase
        item_class = globals().get(item_type.capitalize())
    except ValueError as e:
        return ValueError(f"Model class for '{item_type}' not found.\n'{str(e)}"), 404
    
    max_rank = item_class.query.order_by(item_class.rank.desc()).first()
    if max_rank is None:
        return 0
    return max_rank.rank
    

@app.route("/scope/add", methods=["GET", "POST"])
def add_scope():
    item = Scope()
    form = ScopeForm()
    items = g.user.owned_scopes + g.user.scopes
    show_modal = False

    if form.validate_on_submit():
        # Set the data for the new scope
        item.owner_id = g.user.id
        item.rank = get_max_rank('scope') + 1

        item.name = form.name.data
        item.description = form.description.data
        
        # will use the following line when a user shares a scope with another user
        # g.user.scopes.append(item)

        try:
            db.session.add(item)
            db.session.commit()
            flash("Scope added!", "success")
            form = ScopeForm()
        except SQLAlchemyError as e:
            db.session.rollback()
            flash(f"An error occurred: {str(e)}", "error")
        return redirect(request.referrer or url_for("scope"))
    else:
        show_modal = "scope-modal"
    # TODO: This needs to be tested
    return render_template('scope.html', scope_form=form, show_modal=show_modal, scopes=items)

@app.route("/task/add", methods=["GET", "POST"])
@scope_required
def add_task():

    item = Task()
    form = TaskForm()
    items = [item for item in g.scope.tasks if not item.completed]
    show_modal = False
    print(form.errors)
    if form.validate_on_submit():
        print('after form validate on submit')
        # Set the data for the new scope
        item.owner_id = g.user.id
        item.rank = get_max_rank('task') + 1
        item.start_date = datetime.fromisoformat(datetime.utcnow().strftime("%Y-%m-%dT%H:%M"))
        
        item.name = form.name.data
        item.description = form.description.data
        item.end_date = form.end_date.data
        
        g.scope.tasks.append(item)

        try:
            db.session.add(item)
            db.session.commit()
            flash("Task added!", "success")
            form = TaskForm()
        except SQLAlchemyError as e:
            db.session.rollback()
            flash(f"An error occurred: {str(e)}", "error")
        return redirect(request.referrer or url_for("task"))
    else:
        show_modal = "task-modal"
    # TODO: This needs to be tested
    return render_template('task.html', task_form=form, show_modal=show_modal, tasks=items, scope=g.scope)


@app.route("/scope/edit/<int:id>", methods=["GET", "POST"])
def edit_scope(id):
    items = g.user.owned_scopes + g.user.scopes
    item = Scope.query.get_or_404(id)
    form = ScopeForm(obj=item)
    show_modal = False

    if form.validate_on_submit():
        item.name = form.name.data
        item.description = form.description.data
        try:
            db.session.commit()
            flash("Scope edited!", "success")
            form = ScopeForm()
        except SQLAlchemyError as e:
            db.session.rollback()
            flash(f"An error occurred: {str(e)}", "error")
        return redirect(request.referrer or url_for("scope"))
    else:
        show_modal = "scope-modal"
    return render_template('scope.html', scope_form=form, show_modal=show_modal, scopes=items)


@app.route("/task/edit/<int:id>", methods=["GET", "POST"])
@scope_required
def edit_task(id):
    items = [task for task in g.scope.tasks if not task.completed]
    item = Task.query.get_or_404(id)
    form = TaskForm(obj=item)
    show_modal = False

    if form.validate_on_submit():
        #edit the item
        item.name = form.name.data
        item.description = form.description.data
        try:
            db.session.commit()
            flash("Task edited!", "success")
            form = TaskForm()
        except SQLAlchemyError as e:
            db.session.rollback()
            flash(f"An error occurred: {str(e)}", "error")
        return redirect(request.referrer or url_for("task"))
    else:
        show_modal = "task-modal"
    return render_template('task.html', task_form=form, show_modal=show_modal, tasks=items)


@app.route("/<string:item_type>/delete/<int:id>", methods=["POST"])
def delete_item(item_type, id):
    if item_type == "scope" or item_type == "task":
        try:
            # TODO: This may need to be adjusted for CamelCase
            item_class = globals().get(item_type.capitalize())
            item = item_class.query.get_or_404(id)
                
            db.session.delete(item)
            db.session.commit()
            flash(f"{item_class.__name__} deleted!", "success")
            return jsonify({'success': True, 'message': f"{item_class.__name__} deleted!"})
        except ValueError as e:
            db.session.rollback()
            flash(f"An error occurred: {str(e)}", "error")
            return jsonify({'success': False, 'message': f"An error occurred: {str(e)}"}), 500
        # return redirect(request.referrer or url_for(item_type))
    return "Invalid item type", 404


@app.route("/complete_task/<int:id>")
@scope_required
def complete_task(id):
    try:
        item = Task.query.get_or_404(id)
        if item.completed:
            item.uncomplete_task()
        else:
            item.complete_task()
        db.session.commit()
    except SQLAlchemyError as e:
        db.session.rollback()
        flash(f"An error occurred: {str(e)}", "error")
    return redirect(request.referrer or url_for("task"))


@app.route("/<string:item_type>/rank", methods=["POST"])
def update_item_rank(item_type):
    items_list = request.json["items"]
    for data in items_list:
        try:
            item_class = globals().get(item_type.capitalize())
            item = item_class.query.get_or_404(data["id"])
            item.rank = data["newRank"]
            db.session.commit()
        except ValueError as e:
            return str(e), 404
    return jsonify({"success": True})


# Beadcrumbs
# ------------------------------
# @app.route('/some/path')
# def my_view_function():
#     breadcrumbs = [
#         {"text": "Home", "url": url_for('home')},
#         {"text": "Library", "url": url_for('library')},
#         {"text": "Data", "url": None}  # Current page
#     ]
#     return render_template('my_template.html', breadcrumbs=breadcrumbs)

# Application Execution
# ------------------------------
if __name__ == "__main__":
    app.run(debug=True)
    # app.run(host='0.0.0.0',port=5000)
