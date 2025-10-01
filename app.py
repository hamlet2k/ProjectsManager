from datetime import datetime
from functools import wraps
import logging

from flask import (
    Flask,
    abort,
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

from sqlalchemy.exc import SQLAlchemyError, IntegrityError
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
from models.tag import Tag
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
    if scope_selected and g.user:
        scope = Scope.query.get(scope_selected)
        if scope and _user_can_access_scope(scope):
            g.scope = scope
            return
        session.pop("selected_scope", None)
    g.scope = None

def scope_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not g.scope or not _user_can_access_scope(g.scope):
            flash("Please select a valid scope", "warning")
            return redirect(request.referrer or url_for("home"))
        return f(*args, **kwargs)
    return decorated_function


def _user_can_access_scope(scope: Scope) -> bool:
    if g.user is None or scope is None:
        return False
    if scope.owner_id == g.user.id:
        return True
    return any(shared_scope.id == scope.id for shared_scope in g.user.scopes)


def _user_owns_scope(scope: Scope) -> bool:
    return g.user is not None and scope is not None and scope.owner_id == g.user.id


@app.route("/scope/<int:id>")
def set_scope(id):
    scope = Scope.query.get_or_404(id)
    if not _user_can_access_scope(scope):
        flash("You do not have access to that scope.", "danger")
        return redirect(url_for("scope"))
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
    show_completed = request.args.get("show_completed", "false").lower() == "true"
    valid_sorts = {"rank", "name", "tags", "due_date"}
    requested_sort = request.args.get("sort_by")

    sort_preferences = session.get("task_sort_preferences", {})
    scope_key = str(g.scope.id)
    stored_sort = sort_preferences.get(scope_key)

    if requested_sort in valid_sorts:
        sort_by = requested_sort
        if stored_sort != sort_by:
            sort_preferences[scope_key] = sort_by
            session["task_sort_preferences"] = sort_preferences
            session.modified = True
    elif stored_sort in valid_sorts:
        sort_by = stored_sort
    else:
        sort_by = "rank"

    search_query = request.args.get("search", "") or ""
    search_query = search_query.strip()
    search_term = search_query.lower()

    filtered_tasks = []
    for task in g.scope.tasks:
        if task.owner_id != g.user.id:
            continue
        if not show_completed and task.completed:
            continue

        if search_term:
            haystack = f"{task.name or ''} {task.description or ''}".lower()
            if search_term not in haystack:
                continue

        filtered_tasks.append(task)

    available_tags = (
        Tag.query.join(Tag.tasks)
        .filter(Task.scope_id == g.scope.id, Task.owner_id == g.user.id)
        .distinct()
        .order_by(Tag.name.asc())
        .all()
    )

    tag_usage = {
        tag.id: sum(
            1
            for tag_task in tag.tasks
            if tag_task.scope_id == g.scope.id and tag_task.owner_id == g.user.id
        )
        for tag in available_tags
    }

    task_groups = []
    sortable_group_ids = []

    def _sort_tasks(tasks, key_func=None):
        key_func = key_func or (lambda item: item.rank or 0)
        return sorted(
            tasks,
            key=lambda item: (
                bool(item.completed),
                key_func(item),
                item.id,
            ),
        )

    if sort_by == "name":
        ordered = _sort_tasks(
            filtered_tasks,
            key_func=lambda item: (item.name or "").lower(),
        )
        task_groups.append(
            {
                "title": None,
                "dom_id": "tasks-accordion",
                "tasks": ordered,
                "sortable": False,
            }
        )
    elif sort_by == "due_date":
        today = datetime.utcnow().date()

        def _due_key(item):
            return item.end_date or datetime.max

        buckets = {
            "today": {
                "title": "Today",
                "dom_id": "tasks-due-today",
                "tasks": [],
            },
            "tomorrow": {
                "title": "Tomorrow",
                "dom_id": "tasks-due-tomorrow",
                "tasks": [],
            },
            "next_week": {
                "title": "Next week",
                "dom_id": "tasks-due-next-week",
                "tasks": [],
            },
            "next_month": {
                "title": "Next month",
                "dom_id": "tasks-due-next-month",
                "tasks": [],
            },
            "future": {
                "title": "Future",
                "dom_id": "tasks-due-future",
                "tasks": [],
            },
            "without_due": {
                "title": "Without due date",
                "dom_id": "tasks-without-due-date",
                "tasks": [],
            },
        }

        for task in filtered_tasks:
            if not task.end_date:
                buckets["without_due"]["tasks"].append(task)
                continue

            due_date = task.end_date.date()
            delta = (due_date - today).days
            if delta <= 0:
                buckets["today"]["tasks"].append(task)
            elif delta == 1:
                buckets["tomorrow"]["tasks"].append(task)
            elif 2 <= delta <= 7:
                buckets["next_week"]["tasks"].append(task)
            elif 8 <= delta <= 30:
                buckets["next_month"]["tasks"].append(task)
            else:
                buckets["future"]["tasks"].append(task)

        bucket_order = [
            "today",
            "tomorrow",
            "next_week",
            "next_month",
            "future",
            "without_due",
        ]

        for bucket_key in bucket_order:
            bucket = buckets[bucket_key]
            if not bucket["tasks"]:
                continue
            task_groups.append(
                {
                    "title": bucket["title"],
                    "dom_id": bucket["dom_id"],
                    "tasks": _sort_tasks(bucket["tasks"], key_func=_due_key),
                    "sortable": False,
                    "due_bucket": bucket_key,
                }
            )
    elif sort_by == "tags":
        for tag in available_tags:
            tagged_tasks = _sort_tasks(
                [
                    task
                    for task in filtered_tasks
                    if any(t.id == tag.id for t in task.tags)
                ]
            )
            if not tagged_tasks:
                continue
            dom_id = f"tasks-tag-{tag.id}"
            task_groups.append(
                {
                    "title": f"#{tag.name}",
                    "dom_id": dom_id,
                    "tasks": tagged_tasks,
                    "sortable": True,
                    "tag_id": tag.id,
                    "tag_name": tag.name,
                }
            )
            sortable_group_ids.append(dom_id)

        untagged = _sort_tasks(
            [task for task in filtered_tasks if not task.tags]
        )
        if untagged:
            dom_id = "tasks-untagged"
            task_groups.append(
                {
                    "title": "Untagged",
                    "dom_id": dom_id,
                    "tasks": untagged,
                    "sortable": True,
                    "tag_id": None,
                }
            )
            sortable_group_ids.append(dom_id)
    else:  # sort_by == "rank"
        ordered = _sort_tasks(filtered_tasks)
        dom_id = "tasks-accordion"
        task_groups.append(
            {
                "title": None,
                "dom_id": dom_id,
                "tasks": ordered,
                "sortable": True,
            }
        )
        sortable_group_ids.append(dom_id)

    # Ensure sortable group IDs are unique and only for sortable groups
    sortable_group_ids = [
        group["dom_id"]
        for group in task_groups
        if group.get("sortable")
    ]

    form = TaskForm()
    form.tags.data = ""

    response_context = {
        "task_groups": task_groups,
        "task_form": form,
        "scope": g.scope,
        "show_completed": show_completed,
        "available_tags": available_tags,
        "tag_usage": tag_usage,
        "sort_by": sort_by,
        "search_query": search_query,
        "sortable_group_ids": sortable_group_ids,
    }

    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        html = render_template(
            "components/task_groups.html",
            **response_context,
        )
        return jsonify(
            {
                "html": html,
                "sort_by": sort_by,
                "sortable_group_ids": sortable_group_ids,
            }
        )

    return render_template("task.html", **response_context)


@app.route("/tags", methods=["GET"])
@scope_required
def list_tags():
    tags = (
        Tag.query.join(Tag.tasks)
        .filter(Task.scope_id == g.scope.id, Task.owner_id == g.user.id)
        .distinct()
        .order_by(Tag.name.asc())
        .all()
    )
    serialized_tags = []
    for tag in tags:
        payload = tag.to_dict()
        payload["task_count"] = sum(
            1
            for tag_task in tag.tasks
            if tag_task.scope_id == g.scope.id and tag_task.owner_id == g.user.id
        )
        serialized_tags.append(payload)
    return jsonify({"tags": serialized_tags})


@app.route("/tags", methods=["POST"])
@scope_required
def create_tag():
    if not _user_can_access_scope(g.scope):
        return jsonify({"error": "You do not have permission to modify tags."}), 403
    payload = request.get_json(silent=True) or {}
    raw_name = payload.get("name", "")
    normalized_name = raw_name.lstrip("#").strip().lower()

    if not normalized_name:
        return jsonify({"error": "Tag name is required."}), 400

    tag = Tag(name=normalized_name)
    try:
        db.session.add(tag)
        db.session.commit()
        created = True
    except IntegrityError:
        db.session.rollback()
        tag = Tag.query.filter_by(name=normalized_name).first()
        if tag is None:
            return jsonify({"error": "Unable to create tag."}), 500
        created = False
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    tag_payload = {
        "id": tag.id,
        "name": tag.name,
        "task_count": sum(
            1
            for tag_task in tag.tasks
            if tag_task.scope_id == g.scope.id and tag_task.owner_id == g.user.id
        ),
    }

    return jsonify({"tag": tag_payload, "created": created})


@app.route("/tags/<int:tag_id>", methods=["DELETE"])
@scope_required
def delete_tag(tag_id):
    tag = Tag.query.get_or_404(tag_id)

    for task in tag.tasks:
        if task.owner_id != g.user.id or task.scope_id != g.scope.id:
            return jsonify({"error": "You do not have permission to delete this tag."}), 403

    try:
        for task in list(tag.tasks):
            task.tags.remove(tag)
        db.session.delete(tag)
        db.session.commit()
    except SQLAlchemyError as e:
        db.session.rollback()
        logging.exception("Error deleting tag with id %s", tag_id)
        return jsonify({"error": "Unable to delete tag due to an internal error."}), 500

    return jsonify({"deleted": True, "tag_id": tag_id})


def _get_task_in_scope_or_404(task_id):
    task = Task.query.get_or_404(task_id)
    if (
        g.scope is None
        or task.scope_id != g.scope.id
        or task.owner_id != g.user.id
        or not _user_can_access_scope(task.scope)
    ):
        abort(404)
    return task


def _parse_tag_ids(raw_value):
    if not raw_value:
        return []
    tag_ids = []
    for value in raw_value.split(","):
        value = value.strip()
        if not value:
            continue
        try:
            tag_id = int(value)
        except ValueError:
            continue
        tag_ids.append(tag_id)
    return tag_ids


@app.route("/tasks/<int:task_id>/tags", methods=["GET"])
@scope_required
def get_task_tags(task_id):
    task = _get_task_in_scope_or_404(task_id)
    return jsonify({"tags": [tag.to_dict() for tag in task.tags]})


@app.route("/tasks/<int:task_id>/tags", methods=["POST"])
@scope_required
def add_tag_to_task(task_id):
    payload = request.get_json(silent=True) or {}
    tag_id = payload.get("tag_id")
    if not tag_id:
        return jsonify({"error": "Tag id is required."}), 400

    task = _get_task_in_scope_or_404(task_id)
    tag = Tag.query.get_or_404(tag_id)

    if tag not in task.tags:
        try:
            task.tags.append(tag)
            db.session.commit()
        except SQLAlchemyError as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 500

    return jsonify({"tag": tag.to_dict(), "assigned": True})


@app.route("/tasks/<int:task_id>/tags/<int:tag_id>", methods=["DELETE"])
@scope_required
def remove_tag_from_task(task_id, tag_id):
    task = _get_task_in_scope_or_404(task_id)
    tag = Tag.query.get_or_404(tag_id)

    if tag in task.tags:
        try:
            task.tags.remove(tag)
            db.session.commit()
        except SQLAlchemyError as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 500

    return jsonify({"tag": tag.to_dict(), "assigned": False})

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
    form.tags.data = form.tags.data or ""
    items = [item for item in g.scope.tasks if item.owner_id == g.user.id and not item.completed]
    show_modal = False
    wants_json = (
        request.headers.get("X-Requested-With") == "XMLHttpRequest"
        or request.accept_mimetypes["application/json"] >= request.accept_mimetypes["text/html"]
    )
    if form.validate_on_submit():
        # Set the data for the new scope
        item.owner_id = g.user.id
        item.rank = get_max_rank('task') + 1
        item.start_date = datetime.fromisoformat(datetime.utcnow().strftime("%Y-%m-%dT%H:%M"))

        item.name = form.name.data
        item.description = form.description.data
        item.end_date = form.end_date.data

        tag_ids = _parse_tag_ids(form.tags.data)
        if tag_ids:
            item.tags = Tag.query.filter(Tag.id.in_(tag_ids)).all()
        else:
            item.tags = []

        g.scope.tasks.append(item)

        try:
            db.session.add(item)
            db.session.commit()
            success_message = f'Task "{item.name}" added!'
            if wants_json:
                return jsonify({"success": True, "message": success_message, "task_id": item.id})
            flash(success_message, "success")
            form = TaskForm()
        except SQLAlchemyError as e:
            db.session.rollback()
            logging.error("Database error while adding task", exc_info=True)
            error_message = "An internal error has occurred."
            if wants_json:
                return jsonify({"success": False, "message": error_message}), 500
            flash(error_message, "error")
        return redirect(request.referrer or url_for("task"))
    else:
        if wants_json:
            return jsonify({
                "success": False,
                "message": "Please correct the highlighted fields.",
                "errors": form.errors,
            }), 400
        show_modal = "task-modal"
    # TODO: This needs to be tested
    return render_template('task.html', task_form=form, show_modal=show_modal, tasks=items, scope=g.scope)


@app.route("/scope/edit/<int:id>", methods=["GET", "POST"])
def edit_scope(id):
    items = g.user.owned_scopes + g.user.scopes
    item = Scope.query.get_or_404(id)
    if not _user_owns_scope(item):
        abort(404)
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
    items = [task for task in g.scope.tasks if task.owner_id == g.user.id and not task.completed]
    item = Task.query.get_or_404(id)
    if item.scope_id != g.scope.id or item.owner_id != g.user.id:
        abort(404)
    form = TaskForm(obj=item)
    form.tags.data = ",".join(str(tag.id) for tag in item.tags)
    wants_json = (
        request.headers.get("X-Requested-With") == "XMLHttpRequest"
        or request.accept_mimetypes["application/json"] >= request.accept_mimetypes["text/html"]
    )
    show_modal = False

    if form.validate_on_submit():
        #edit the item
        item.name = form.name.data
        item.description = form.description.data
        item.end_date = form.end_date.data

        tag_ids = _parse_tag_ids(form.tags.data)
        if tag_ids:
            item.tags = Tag.query.filter(Tag.id.in_(tag_ids)).all()
        else:
            item.tags = []
        try:
            db.session.commit()
            success_message = f'Task "{item.name}" updated!'
            if wants_json:
                return jsonify({"success": True, "message": success_message, "task_id": item.id})
            flash(success_message, "success")
            form = TaskForm()
        except SQLAlchemyError as e:
            db.session.rollback()
            logging.error("Database error during task update", exc_info=True)
            generic_error_message = "An internal error occurred while updating the task. Please try again later."
            if wants_json:
                return jsonify({"success": False, "message": generic_error_message}), 500
            flash(generic_error_message, "error")
        return redirect(request.referrer or url_for("task"))
    else:
        if wants_json:
            return jsonify({
                "success": False,
                "message": "Please correct the highlighted fields.",
                "errors": form.errors,
            }), 400
        show_modal = "task-modal"
    return render_template('task.html', task_form=form, show_modal=show_modal, tasks=items)


@app.route("/<string:item_type>/delete/<int:id>", methods=["POST"])
def delete_item(item_type, id):
    if item_type == "scope" or item_type == "task":
        try:
            # TODO: This may need to be adjusted for CamelCase
            item_class = globals().get(item_type.capitalize())
            item = item_class.query.get_or_404(id)

            if item_type == "scope":
                if not _user_owns_scope(item):
                    return (
                        jsonify(
                            {
                                "success": False,
                                "message": "You do not have permission to delete this scope.",
                            }
                        ),
                        403,
                    )
            elif item_type == "task":
                if (
                    item.scope is None
                    or not _user_can_access_scope(item.scope)
                    or item.owner_id != g.user.id
                ):
                    return (
                        jsonify(
                            {
                                "success": False,
                                "message": "You do not have permission to delete this task.",
                            }
                        ),
                        403,
                    )

            db.session.delete(item)
            db.session.commit()
            item_label = getattr(item, "name", None)
            message = f"{item_class.__name__} deleted!"
            if item_label:
                message = f"{item_class.__name__} \"{item_label}\" deleted!"
            flash(message, "success")
            return jsonify({'success': True, 'message': message})
        except ValueError as e:
            db.session.rollback()
            flash(f"An error occurred: {str(e)}", "error")
            return jsonify({'success': False, 'message': f"An error occurred: {str(e)}"}), 500
        # return redirect(request.referrer or url_for(item_type))
    return "Invalid item type", 404


@app.route("/complete_task/<int:id>")
@scope_required
def complete_task(id):
    wants_json = request.headers.get("X-Requested-With") == "XMLHttpRequest" or (
        request.accept_mimetypes["application/json"]
        >= request.accept_mimetypes["text/html"]
    )
    try:
        item = _get_task_in_scope_or_404(id)
        if item.completed:
            item.uncomplete_task()
        else:
            item.complete_task()
        db.session.commit()

        task_label = getattr(item, "name", None)
        if item.completed:
            message = (
                f'Task "{task_label}" completed.' if task_label else "Task completed."
            )
            category = "success"
        else:
            message = (
                f'Task "{task_label}" restored.' if task_label else "Task restored."
            )
            category = "info"

        if wants_json:
            return jsonify(
                {
                    "success": True,
                    "completed": item.completed,
                    "message": message,
                    "category": category,
                }
            )

        flash(message, category)
    except SQLAlchemyError as e:
        db.session.rollback()
        error_message = f"An error occurred: {str(e)}"
        if wants_json:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": error_message,
                        "category": "danger",
                    }
                ),
                500,
            )
        flash(error_message, "error")
    return redirect(request.referrer or url_for("task"))


@app.route("/<string:item_type>/rank", methods=["POST"])
def update_item_rank(item_type):
    items_list = request.json["items"]
    try:
        item_class = globals().get(item_type.capitalize())
        if item_class is None:
            raise ValueError(f"Model class for '{item_type}' not found.")
    except ValueError as e:
        logging.exception("Model class lookup failed for item_type '%s': %s", item_type, str(e))
        return "Item type not found.", 404

    for data in items_list:
        item = item_class.query.get_or_404(data["id"])

        if item_type == "task":
            if g.scope is None or not _user_can_access_scope(g.scope):
                return jsonify({"error": "No scope selected."}), 400
            if item.scope_id != g.scope.id or item.owner_id != g.user.id:
                return jsonify({"error": "You do not have permission to reorder this task."}), 403
        elif item_type == "scope":
            if not _user_owns_scope(item):
                return jsonify({"error": "You do not have permission to reorder this scope."}), 403

        item.rank = data["newRank"]

    db.session.commit()
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
