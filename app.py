from datetime import datetime
import json
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

from sqlalchemy import or_
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
from models.sync_log import SyncLog

from forms import (
    ScopeForm,
    TaskForm,
    SignupForm,
    LoginForm,
    UserSettingsForm,
    GitHubSettingsForm,
    THEME_CHOICES,
)
from services.github_service import (
    GITHUB_APP_LABEL,
    GitHubError,
    comment_on_issue,
    create_issue,
    fetch_issue,
    list_repositories,
    test_connection,
    update_issue,
    close_issue,
)

LOCAL_GITHUB_TAG_NAME = "github"
GITHUB_ISSUE_MISSING_MESSAGE = (
    "Linked GitHub issue could not be found and the link has been removed."
)

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
    github_form = GitHubSettingsForm()

    selected_repo = g.user.github_repo_as_dict()
    if not github_form.is_submitted():
        if selected_repo:
            github_form.repository.choices = [
                (json.dumps(selected_repo), f"{selected_repo['owner']}/{selected_repo['name']}")
            ]
            github_form.repository.data = json.dumps(selected_repo)
        github_form.enabled.data = g.user.github_integration_enabled
    elif selected_repo and not github_form.repository.choices:
        github_form.repository.choices = [
            (json.dumps(selected_repo), f"{selected_repo['owner']}/{selected_repo['name']}")
        ]

    if user_form.submit.data and user_form.validate_on_submit():
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

    if github_form.submit.data and github_form.validate_on_submit():
        token_input = (github_form.token.data or "").strip()
        if github_form.enabled.data:
            if token_input:
                g.user.set_github_token(token_input)
                token_to_use = token_input
            else:
                token_to_use = g.user.get_github_token()
            if not token_to_use:
                github_form.token.errors.append("Token is required when enabling integration.")
            repo_value = github_form.repository.data
            repo_payload = None
            if repo_value:
                try:
                    repo_payload = json.loads(repo_value)
                except ValueError:
                    github_form.repository.errors.append("Invalid repository selection.")
            elif not selected_repo:
                github_form.repository.errors.append("Please select a repository.")

            if not github_form.errors:
                g.user.github_integration_enabled = True
                if repo_payload:
                    g.user.github_repo_id = repo_payload.get("id")
                    g.user.github_repo_name = repo_payload.get("name")
                    g.user.github_repo_owner = repo_payload.get("owner")
                elif selected_repo:
                    g.user.github_repo_id = selected_repo.get("id")
                    g.user.github_repo_name = selected_repo.get("name")
                    g.user.github_repo_owner = selected_repo.get("owner")
                try:
                    db.session.commit()
                    flash("GitHub settings saved.", "success")
                    return redirect(url_for("user"))
                except SQLAlchemyError as e:
                    db.session.rollback()
                    flash(f"An error occurred: {str(e)}", "error")
        else:
            g.user.github_integration_enabled = False
            g.user.github_repo_id = None
            g.user.github_repo_name = None
            g.user.github_repo_owner = None
            g.user.set_github_token(None)
            try:
                db.session.commit()
                flash("GitHub integration disabled.", "info")
                return redirect(url_for("user"))
            except SQLAlchemyError as e:
                db.session.rollback()
                flash(f"An error occurred: {str(e)}", "error")

    token_present = bool(g.user.github_token_encrypted)

    return render_template(
        "user.html",
        user_form=user_form,
        github_form=github_form,
        github_token_present=token_present,
        github_repo=selected_repo,
    )


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


def _serialize_task_for_clipboard(task: Task) -> dict:
    if task is None:
        return {}

    def _serialize_subtask(subtask: Task) -> dict:
        if subtask is None:
            return {}
        return {
            "id": subtask.id,
            "name": subtask.name or "",
            "description": subtask.description or "",
        }

    subtasks = sorted(
        (subtask for subtask in task.subtasks or []),
        key=lambda item: ((item.rank or 0), item.id),
    )

    return {
        "id": task.id,
        "name": task.name or "",
        "description": task.description or "",
        "due_date": task.end_date.isoformat() if task.end_date else None,
        "completed": bool(task.completed),
        "completed_date": task.completed_date.isoformat() if task.completed_date else None,
        "tags": [tag.name for tag in task.tags],
        "subtasks": [_serialize_subtask(subtask) for subtask in subtasks],
    }


def _ensure_tags_assigned_to_current_scope(tags):
    """Ensure every provided tag belongs to the active scope."""

    if not tags:
        return False

    if g.scope is None:
        abort(400)

    changed = False
    for tag in tags:
        if tag.scope_id is None:
            tag.scope_id = g.scope.id
            changed = True
        elif tag.scope_id != g.scope.id:
            abort(404)

    return changed


def _get_tags_for_scope(tag_ids):
    if not tag_ids:
        return []

    if g.scope is None:
        abort(400)

    tags = (
        Tag.query.filter(Tag.id.in_(tag_ids))
        .filter(or_(Tag.scope_id == g.scope.id, Tag.scope_id.is_(None)))
        .all()
    )

    found_ids = {tag.id for tag in tags}
    missing = {tag_id for tag_id in tag_ids if tag_id not in found_ids}
    if missing:
        abort(404)

    _ensure_tags_assigned_to_current_scope(tags)
    return tags


def _labels_for_github(task: Task) -> list[str]:
    labels: set[str] = set()
    for tag in task.tags:
        if not tag or not tag.name:
            continue
        name = tag.name.strip()
        if not name:
            continue
        lower = name.lower()
        if lower in {LOCAL_GITHUB_TAG_NAME, GITHUB_APP_LABEL.lower()}:
            continue
        labels.add(name)
    return sorted(labels)


def _get_or_create_local_github_tag(scope: Scope | None):
    if scope is None:
        return None
    tag = Tag.query.filter_by(scope_id=scope.id, name=LOCAL_GITHUB_TAG_NAME).first()
    if tag is None:
        tag = Tag(name=LOCAL_GITHUB_TAG_NAME, scope_id=scope.id)
        db.session.add(tag)
        db.session.flush()
    return tag


def _ensure_local_github_tag(task: Task) -> None:
    if not task.github_issue_number:
        return
    scope = task.scope
    if scope is None:
        return
    tag = _get_or_create_local_github_tag(scope)
    if tag and tag not in task.tags:
        task.tags.append(tag)


def _remove_local_github_tag(task: Task) -> None:
    if not task.tags:
        return
    for tag in list(task.tags):
        if (tag.name or "").lower() == LOCAL_GITHUB_TAG_NAME:
            task.tags.remove(tag)
            break


def _clear_github_issue_link(task: Task) -> None:
    task.github_issue_id = None
    task.github_issue_number = None
    task.github_issue_url = None
    task.github_issue_state = None
    _remove_local_github_tag(task)


def _push_task_labels_to_github(task: Task, context: dict[str, str]) -> None:
    labels = _labels_for_github(task)
    issue = update_issue(
        context["token"],
        context["owner"],
        context["name"],
        task.github_issue_number,
        labels=labels,
    )
    task.github_issue_state = issue.state
    _record_sync(task, "update_issue", "success", f"Issue #{issue.number} labels updated")


def _user_github_context(user: User | None):
    if not user or not user.github_integration_enabled:
        return None
    token = user.get_github_token()
    if not token:
        return None
    if not user.github_repo_owner or not user.github_repo_name:
        return None
    return {
        "token": token,
        "owner": user.github_repo_owner,
        "name": user.github_repo_name,
        "id": user.github_repo_id,
    }


def _record_sync(task: Task, action: str, status: str, message: str | None = None):
    log_entry = SyncLog(task=task, action=action, status=status, message=message)
    db.session.add(log_entry)


def _tags_for_labels(scope: Scope, labels: list[str]):
    normalized = []
    for label in labels:
        if not label:
            continue
        lower = label.lower()
        if lower == GITHUB_APP_LABEL.lower() or lower == LOCAL_GITHUB_TAG_NAME:
            continue
        normalized.append(label.strip().lstrip("#").lower())
    if not normalized:
        return []

    tags = (
        Tag.query.filter(
            Tag.name.in_(normalized),
            or_(Tag.scope_id == scope.id, Tag.scope_id.is_(None)),
        ).all()
    )
    existing = {tag.name: tag for tag in tags}
    created = False
    for name in normalized:
        if name not in existing:
            tag = Tag(name=name, scope_id=scope.id)
            db.session.add(tag)
            tags.append(tag)
            existing[name] = tag
            created = True
    if created:
        try:
            db.session.flush()
        except SQLAlchemyError:
            db.session.rollback()
            raise
    return tags


def _sync_task_from_issue(task: Task, issue, scope: Scope):
    task.name = issue.title or task.name
    task.description = issue.body or task.description
    task.github_issue_state = issue.state
    if issue.state == "closed":
        if not task.completed:
            task.complete_task()
    else:
        if task.completed:
            task.uncomplete_task()
    labels = issue.labels or []
    try:
        tags = _tags_for_labels(scope, labels)
    except SQLAlchemyError as exc:
        logging.error("Unable to sync tags from GitHub issue: %s", exc, exc_info=True)
        raise
    if tags is not None:
        task.tags = tags
    _ensure_local_github_tag(task)


def _invalidate_github(user: User):
    user.github_integration_enabled = False
    user.github_repo_id = None
    user.github_repo_name = None
    user.github_repo_owner = None
    user.set_github_token(None)


def _github_error_response(error: GitHubError):
    status = error.status_code or 500
    if status in (401, 403):
        message = "GitHub authentication failed. Please update your token."
    elif status == 404:
        message = "Requested GitHub resource was not found."
    else:
        message = str(error)
    return message, status


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


@app.route("/scope/<int:id>/tasks/export", methods=["GET"])
def export_scope_tasks(id):
    scope = Scope.query.get_or_404(id)
    if not _user_can_access_scope(scope):
        return (
            jsonify(
                {
                    "success": False,
                    "message": "You do not have permission to export tasks for this scope.",
                }
            ),
            403,
        )

    if g.user is None:
        return (
            jsonify({"success": False, "message": "You must be logged in to export tasks."}),
            401,
        )

    user_tasks = [task for task in scope.tasks if task.owner_id == g.user.id]
    user_tasks.sort(key=lambda item: ((item.rank or 0), item.id))

    payload = [_serialize_task_for_clipboard(task) for task in user_tasks]

    return jsonify(
        {
            "success": True,
            "scope": {"id": scope.id, "name": scope.name or ""},
            "tasks": payload,
        }
    )


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

    github_linked_task_count = sum(
        1
        for scope_task in g.scope.tasks
        if scope_task.owner_id == g.user.id and scope_task.github_issue_number is not None
    )
    has_github_linked_tasks = github_linked_task_count > 0

    available_tags = (
        Tag.query.filter(
            or_(Tag.scope_id == g.scope.id, Tag.scope_id.is_(None))
        )
        .order_by(Tag.name.asc())
        .all()
    )
    if _ensure_tags_assigned_to_current_scope(available_tags):
        try:
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()
            logging.exception("Unable to assign tags to scope during task view")
            abort(500)

    if not has_github_linked_tasks:
        available_tags = [
            tag for tag in available_tags if (tag.name or "").lower() != LOCAL_GITHUB_TAG_NAME
        ]

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
        "github_enabled": bool(_user_github_context(g.user)),
        "github_repo": g.user.github_repo_as_dict(),
        "github_label": GITHUB_APP_LABEL,
        "github_local_tag_name": LOCAL_GITHUB_TAG_NAME,
        "has_github_linked_tasks": has_github_linked_tasks,
    }

    available_tags_payload = [
        {
            "id": tag.id,
            "name": tag.name,
            "scope_id": tag.scope_id,
            "task_count": tag_usage.get(tag.id, 0),
        }
        for tag in available_tags
    ]

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
                "available_tags": available_tags_payload,
                "has_github_linked_tasks": has_github_linked_tasks,
            }
        )

    return render_template("task.html", **response_context)


@app.route("/api/github/connect", methods=["POST"])
def github_connect():
    if g.user is None:
        return jsonify({"success": False, "message": "Authentication required."}), 401

    payload = request.get_json(silent=True) or {}
    token = (payload.get("token") or "").strip()
    test_only = bool(payload.get("test_only"))
    repository_payload = payload.get("repository")

    if not token:
        token = g.user.get_github_token()

    if not token:
        return jsonify({"success": False, "message": "Token is required."}), 400

    if not test_connection(token):
        return jsonify({"success": False, "message": "Unable to authenticate with GitHub."}), 403

    if not test_only:
        g.user.set_github_token(token)
        g.user.github_integration_enabled = True
        if isinstance(repository_payload, dict):
            g.user.github_repo_id = repository_payload.get("id")
            g.user.github_repo_name = repository_payload.get("name")
            g.user.github_repo_owner = repository_payload.get("owner")
        try:
            db.session.commit()
        except SQLAlchemyError as exc:
            db.session.rollback()
            logging.error("Error saving GitHub connection: %s", exc, exc_info=True)
            return jsonify({"success": False, "message": "Unable to save GitHub settings."}), 500

    return jsonify({"success": True})


@app.route("/api/github/repos", methods=["GET"])
def github_repositories():
    if g.user is None:
        return jsonify({"success": False, "message": "Authentication required."}), 401

    token = g.user.get_github_token()
    override_token = request.args.get("token")
    if override_token:
        token = override_token.strip()

    if not token:
        return jsonify({"success": False, "message": "Token is required."}), 400

    try:
        repos = list_repositories(token)
    except GitHubError as error:
        if error.status_code in (401, 403):
            _invalidate_github(g.user)
            try:
                db.session.commit()
            except SQLAlchemyError:
                db.session.rollback()
        message, status = _github_error_response(error)
        return jsonify({"success": False, "message": message}), status

    payload = [
        {"id": repo.id, "name": repo.name, "owner": repo.owner}
        for repo in repos
    ]
    return jsonify({"success": True, "repositories": payload})


def _task_owner_guard(task: Task):
    if task.owner_id != g.user.id or task.scope_id != g.scope.id:
        abort(403)


@app.route("/api/github/issue/create", methods=["POST"])
@scope_required
def github_issue_create():
    if g.user is None:
        return jsonify({"success": False, "message": "Authentication required."}), 401

    payload = request.get_json(silent=True) or {}
    task_id = payload.get("task_id")
    if not task_id:
        return jsonify({"success": False, "message": "task_id is required."}), 400

    task = _get_task_in_scope_or_404(task_id)
    _task_owner_guard(task)

    context = _user_github_context(g.user)
    if not context:
        return jsonify({"success": False, "message": "GitHub integration is not configured."}), 400

    labels = _labels_for_github(task)
    try:
        issue = create_issue(context["token"], context["owner"], context["name"], task.name, task.description or "", labels)
    except GitHubError as error:
        if error.status_code in (401, 403):
            _invalidate_github(g.user)
            try:
                db.session.commit()
            except SQLAlchemyError:
                db.session.rollback()
        message, status = _github_error_response(error)
        return jsonify({"success": False, "message": message}), status

    task.github_issue_id = issue.id
    task.github_issue_number = issue.number
    task.github_issue_url = issue.url
    task.github_issue_state = issue.state
    try:
        _ensure_local_github_tag(task)
    except SQLAlchemyError as exc:
        db.session.rollback()
        logging.error("Unable to add local GitHub tag: %s", exc, exc_info=True)
        return jsonify({"success": False, "message": "Issue created but could not be saved locally."}), 500
    _record_sync(task, "create_issue", "success", f"Issue #{issue.number} created")
    try:
        db.session.commit()
    except SQLAlchemyError as exc:
        db.session.rollback()
        logging.error("Unable to persist GitHub issue link: %s", exc, exc_info=True)
        return jsonify({"success": False, "message": "Issue created but could not be saved locally."}), 500

    return jsonify(
        {
            "success": True,
            "issue": {
                "id": issue.id,
                "number": issue.number,
                "url": issue.url,
                "state": issue.state,
                "labels": issue.labels,
            },
        }
    )


@app.route("/api/github/issue/sync", methods=["POST"])
@scope_required
def github_issue_sync():
    if g.user is None:
        return jsonify({"success": False, "message": "Authentication required."}), 401

    payload = request.get_json(silent=True) or {}
    task_id = payload.get("task_id")
    if not task_id:
        return jsonify({"success": False, "message": "task_id is required."}), 400

    task = _get_task_in_scope_or_404(task_id)
    _task_owner_guard(task)

    if not task.github_issue_number:
        return jsonify({"success": False, "message": "Task is not linked to a GitHub issue."}), 400

    context = _user_github_context(g.user)
    if not context:
        return jsonify({"success": False, "message": "GitHub integration is not configured."}), 400

    try:
        issue = fetch_issue(context["token"], context["owner"], context["name"], task.github_issue_number)
    except GitHubError as error:
        message, status = _github_error_response(error)
        if error.status_code in (401, 403):
            _invalidate_github(g.user)
            try:
                db.session.commit()
            except SQLAlchemyError:
                db.session.rollback()
        elif error.status_code == 404:
            _clear_github_issue_link(task)
            try:
                db.session.commit()
            except SQLAlchemyError:
                db.session.rollback()
        return jsonify({"success": False, "message": message}), status

    try:
        _sync_task_from_issue(task, issue, g.scope)
        _record_sync(task, "sync_issue", "success", f"Issue #{issue.number} synced")
        db.session.commit()
    except SQLAlchemyError as exc:
        db.session.rollback()
        logging.error("Unable to sync issue data: %s", exc, exc_info=True)
        return jsonify({"success": False, "message": "Unable to sync task with GitHub."}), 500

    task_payload = {
        "id": task.id,
        "name": task.name,
        "description": task.description or "",
        "completed": task.completed,
        "end_date": task.end_date.isoformat() if task.end_date else None,
        "tag_ids": [tag.id for tag in task.tags],
        "has_github_issue": task.has_github_issue,
        "github_issue_state": task.github_issue_state,
    }

    return jsonify(
        {
            "success": True,
            "issue": {
                "id": issue.id,
                "number": issue.number,
                "url": issue.url,
                "state": issue.state,
                "labels": issue.labels,
            },
            "task": task_payload,
        }
    )


@app.route("/api/github/issue/close", methods=["POST"])
@scope_required
def github_issue_close():
    if g.user is None:
        return jsonify({"success": False, "message": "Authentication required."}), 401

    payload = request.get_json(silent=True) or {}
    task_id = payload.get("task_id")
    if not task_id:
        return jsonify({"success": False, "message": "task_id is required."}), 400

    task = _get_task_in_scope_or_404(task_id)
    _task_owner_guard(task)

    if not task.github_issue_number:
        return jsonify({"success": False, "message": "Task is not linked to a GitHub issue."}), 400

    context = _user_github_context(g.user)
    if not context:
        return jsonify({"success": False, "message": "GitHub integration is not configured."}), 400

    issue = None
    issue_unlinked = False
    try:
        issue = close_issue(
            context["token"], context["owner"], context["name"], task.github_issue_number
        )
        comment_on_issue(
            context["token"],
            context["owner"],
            context["name"],
            task.github_issue_number,
            "Closed from ProjectsManager.",
        )
    except GitHubError as error:
        if error.status_code == 404:
            _clear_github_issue_link(task)
            _record_sync(
                task,
                "close_issue",
                "missing",
                "Linked issue not found during close; link removed.",
            )
            issue_unlinked = True
        else:
            message, status = _github_error_response(error)
            if error.status_code in (401, 403):
                _invalidate_github(g.user)
                try:
                    db.session.commit()
                except SQLAlchemyError:
                    db.session.rollback()
            return jsonify({"success": False, "message": message}), status

    task.complete_task()
    if issue is not None:
        task.github_issue_state = issue.state
        _record_sync(task, "close_issue", "success", f"Issue #{issue.number} closed")
    else:
        task.github_issue_state = None

    try:
        db.session.commit()
    except SQLAlchemyError as exc:
        db.session.rollback()
        logging.error("Unable to update task after closing GitHub issue: %s", exc, exc_info=True)
        return jsonify({"success": False, "message": "Issue closed but could not update task."}), 500

    response = {"success": True, "task": {"id": task.id, "completed": task.completed}}
    if issue is not None:
        response["issue"] = {
            "number": issue.number,
            "state": issue.state,
            "url": issue.url,
        }
    if issue_unlinked:
        response["github_issue_unlinked"] = True
        response["message"] = GITHUB_ISSUE_MISSING_MESSAGE

    return jsonify(response)


@app.route("/api/github/refresh", methods=["POST"])
def github_refresh():
    if g.user is None:
        return jsonify({"success": False, "message": "Authentication required."}), 401

    context = _user_github_context(g.user)
    if not context:
        return jsonify({"success": False, "message": "GitHub integration is not configured."}), 400

    tasks = (
        Task.query.filter(
            Task.owner_id == g.user.id,
            Task.github_issue_number.isnot(None),
        ).all()
    )
    updated = 0
    for task in tasks:
        if task.scope is None:
            continue
        try:
            issue = fetch_issue(context["token"], context["owner"], context["name"], task.github_issue_number)
        except GitHubError as error:
            if error.status_code in (401, 403):
                _invalidate_github(g.user)
                try:
                    db.session.commit()
                except SQLAlchemyError:
                    db.session.rollback()
                message, status = _github_error_response(error)
                return jsonify({"success": False, "message": message}), status
            if error.status_code == 404:
                _clear_github_issue_link(task)
                continue
            message, _ = _github_error_response(error)
            logging.error("Unable to refresh issue %s: %s", task.github_issue_number, message)
            continue

        previous_state = task.github_issue_state
        try:
            _sync_task_from_issue(task, issue, task.scope)
        except SQLAlchemyError as exc:
            db.session.rollback()
            logging.error("Unable to sync during refresh: %s", exc, exc_info=True)
            continue
        if issue.state == "closed" and previous_state != "closed":
            updated += 1

    try:
        db.session.commit()
    except SQLAlchemyError as exc:
        db.session.rollback()
        logging.error("Unable to commit GitHub refresh: %s", exc, exc_info=True)
        return jsonify({"success": False, "message": "Unable to refresh GitHub data."}), 500

    return jsonify({"success": True, "updated": updated})


@app.route("/tags", methods=["GET"])
@scope_required
def list_tags():
    tags = (
        Tag.query.filter(or_(Tag.scope_id == g.scope.id, Tag.scope_id.is_(None)))
        .order_by(Tag.name.asc())
        .all()
    )
    if _ensure_tags_assigned_to_current_scope(tags):
        try:
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()
            logging.exception("Unable to assign tags to scope while listing tags")
            abort(500)
    has_github_linked_tasks = (
        Task.query.filter(
            Task.scope_id == g.scope.id,
            Task.owner_id == g.user.id,
            Task.github_issue_number.isnot(None),
        )
        .first()
        is not None
    )
    serialized_tags = []
    for tag in tags:
        if not has_github_linked_tasks and (tag.name or "").lower() == LOCAL_GITHUB_TAG_NAME:
            continue
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
    payload = request.get_json(silent=True) or {}
    raw_name = payload.get("name", "")
    normalized_name = raw_name.lstrip("#").strip().lower()

    if not normalized_name:
        return jsonify({"error": "Tag name is required."}), 400

    tag = Tag(name=normalized_name, scope_id=g.scope.id)
    try:
        db.session.add(tag)
        db.session.commit()
        created = True
    except IntegrityError:
        db.session.rollback()
        tag = Tag.query.filter_by(name=normalized_name, scope_id=g.scope.id).first()
        if tag is None:
            return jsonify({"error": "Unable to create tag."}), 500
        created = False
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    tag_payload = {
        "id": tag.id,
        "name": tag.name,
        "scope_id": tag.scope_id,
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
    tag = (
        Tag.query.filter(
            Tag.id == tag_id,
            or_(Tag.scope_id == g.scope.id, Tag.scope_id.is_(None)),
        )
        .first_or_404()
    )
    scope_changed = _ensure_tags_assigned_to_current_scope([tag])

    if (tag.name or "").lower() == LOCAL_GITHUB_TAG_NAME:
        return (
            jsonify({"error": "The github tag is managed automatically and cannot be deleted."}),
            400,
        )

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
    if _ensure_tags_assigned_to_current_scope(task.tags):
        try:
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()
            logging.exception("Unable to assign tags to scope while fetching task tags")
            abort(500)
    return jsonify({"tags": [tag.to_dict() for tag in task.tags]})


@app.route("/tasks/<int:task_id>/tags", methods=["POST"])
@scope_required
def add_tag_to_task(task_id):
    payload = request.get_json(silent=True) or {}
    tag_id = payload.get("tag_id")
    if not tag_id:
        return jsonify({"error": "Tag id is required."}), 400

    task = _get_task_in_scope_or_404(task_id)
    tag = (
        Tag.query.filter(
            Tag.id == tag_id,
            or_(Tag.scope_id == g.scope.id, Tag.scope_id.is_(None)),
        )
        .first_or_404()
    )
    _ensure_tags_assigned_to_current_scope([tag])

    tag_name_lower = (tag.name or "").lower()
    if tag_name_lower == LOCAL_GITHUB_TAG_NAME and not task.github_issue_number:
        return (
            jsonify({"error": "The github tag is reserved for tasks linked to GitHub issues."}),
            400,
        )

    assigned_now = False
    if tag not in task.tags:
        task.tags.append(tag)
        assigned_now = True

    context = _user_github_context(g.user) if task.github_issue_number else None

    try:
        if (
            assigned_now
            and context
            and tag_name_lower != LOCAL_GITHUB_TAG_NAME
            and task.github_issue_number
        ):
            _push_task_labels_to_github(task, context)
        db.session.commit()
    except GitHubError as error:
        if error.status_code == 404:
            _clear_github_issue_link(task)
            _record_sync(
                task,
                "update_issue",
                "missing",
                "Linked issue not found while assigning tag; link removed.",
            )
            try:
                db.session.commit()
            except SQLAlchemyError as exc:
                db.session.rollback()
                logging.error(
                    "Unable to persist task updates after unlinking missing issue: %s",
                    exc,
                    exc_info=True,
                )
                return jsonify({"error": "An internal server error occurred."}), 500
            response = {
                "tag": tag.to_dict(),
                "assigned": True,
                "github_issue_unlinked": True,
                "message": GITHUB_ISSUE_MISSING_MESSAGE,
            }
            return jsonify(response)
        db.session.rollback()
        message, status = _github_error_response(error)
        if error.status_code in (401, 403):
            _invalidate_github(g.user)
            try:
                db.session.commit()
            except SQLAlchemyError:
                db.session.rollback()
        logging.error("Unable to sync labels after assigning tag: %s", message)
        return jsonify({"error": message}), status
    except SQLAlchemyError as e:
        db.session.rollback()
        logging.error("Exception in add_tag_to_task: %s", e, exc_info=True)
        return jsonify({"error": "An internal server error occurred."}), 500

    return jsonify({"tag": tag.to_dict(), "assigned": True})


@app.route("/tasks/<int:task_id>/tags/<int:tag_id>", methods=["DELETE"])
@scope_required
def remove_tag_from_task(task_id, tag_id):
    task = _get_task_in_scope_or_404(task_id)
    tag = (
        Tag.query.filter(
            Tag.id == tag_id,
            or_(Tag.scope_id == g.scope.id, Tag.scope_id.is_(None)),
        )
        .first_or_404()
    )
    scope_changed = _ensure_tags_assigned_to_current_scope([tag])

    tag_name_lower = (tag.name or "").lower()
    if tag_name_lower == LOCAL_GITHUB_TAG_NAME and task.github_issue_number:
        return (
            jsonify({"error": "This task is linked to GitHub and the github tag cannot be removed."}),
            400,
        )

    removed = False
    if tag in task.tags:
        task.tags.remove(tag)
        removed = True

    context = _user_github_context(g.user) if task.github_issue_number else None

    try:
        if removed and context and task.github_issue_number:
            _push_task_labels_to_github(task, context)
        if removed or scope_changed:
            db.session.commit()
        else:
            return jsonify({"tag": tag.to_dict(), "assigned": False})
    except GitHubError as error:
        if error.status_code == 404:
            _clear_github_issue_link(task)
            _record_sync(
                task,
                "update_issue",
                "missing",
                "Linked issue not found while removing tag; link removed.",
            )
            try:
                db.session.commit()
            except SQLAlchemyError as exc:
                db.session.rollback()
                logging.error(
                    "Unable to persist task updates after unlinking missing issue: %s",
                    exc,
                    exc_info=True,
                )
                return jsonify({"error": "An internal server error occurred."}), 500
            response = {
                "tag": tag.to_dict(),
                "assigned": False,
                "github_issue_unlinked": True,
                "message": GITHUB_ISSUE_MISSING_MESSAGE,
            }
            return jsonify(response)
        db.session.rollback()
        message, status = _github_error_response(error)
        if error.status_code in (401, 403):
            _invalidate_github(g.user)
            try:
                db.session.commit()
            except SQLAlchemyError:
                db.session.rollback()
        logging.error("Unable to sync labels after removing tag: %s", message)
        return jsonify({"error": message}), status
    except SQLAlchemyError as e:
        db.session.rollback()
        logging.error("Exception in remove_tag_from_task: %s", e, exc_info=True)
        return jsonify({"error": "An internal server error occurred."}), 500

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
        item.tags = _get_tags_for_scope(tag_ids)

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
    if not form.is_submitted():
        form.tags.data = ",".join(str(tag.id) for tag in item.tags)
    wants_json = (
        request.headers.get("X-Requested-With") == "XMLHttpRequest"
        or request.accept_mimetypes["application/json"] >= request.accept_mimetypes["text/html"]
    )
    show_modal = False

    issue_unlinked = False

    if form.validate_on_submit():
        #edit the item
        item.name = form.name.data
        item.description = form.description.data
        item.end_date = form.end_date.data

        tag_ids = _parse_tag_ids(form.tags.data)
        item.tags = _get_tags_for_scope(tag_ids)
        try:
            _ensure_local_github_tag(item)
        except SQLAlchemyError as exc:
            db.session.rollback()
            logging.error("Unable to maintain GitHub tag during edit: %s", exc, exc_info=True)
            generic_error_message = "An internal error occurred while updating the task. Please try again later."
            if wants_json:
                return jsonify({"success": False, "message": generic_error_message}), 500
            flash(generic_error_message, "error")
            return redirect(request.referrer or url_for("task"))
        context = _user_github_context(g.user)
        if item.github_issue_number and context:
            labels = _labels_for_github(item)
            try:
                issue = update_issue(
                    context["token"],
                    context["owner"],
                    context["name"],
                    item.github_issue_number,
                    title=item.name,
                    body=item.description or "",
                    labels=labels,
                )
                item.github_issue_state = issue.state
                _record_sync(item, "update_issue", "success", f"Issue #{issue.number} updated")
            except GitHubError as error:
                if error.status_code == 404:
                    _clear_github_issue_link(item)
                    issue_unlinked = True
                else:
                    message, status = _github_error_response(error)
                    if error.status_code in (401, 403):
                        _invalidate_github(g.user)
                        try:
                            db.session.commit()
                        except SQLAlchemyError:
                            db.session.rollback()
                    if wants_json:
                        return jsonify({"success": False, "message": message}), status
                    flash(message, "danger")
                    return redirect(request.referrer or url_for("task"))
        try:
            db.session.commit()
            success_message = f'Task "{item.name}" updated!'
            if issue_unlinked:
                success_message = (
                    f"{success_message} {GITHUB_ISSUE_MISSING_MESSAGE}"
                )
            if wants_json:
                response = {
                    "success": True,
                    "message": success_message,
                    "task_id": item.id,
                }
                if issue_unlinked:
                    response["github_issue_unlinked"] = True
                return jsonify(response)
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
                if item.github_issue_is_open:
                    return (
                        jsonify(
                            {
                                "success": False,
                                "message": "Task cannot be deleted until its linked GitHub issue is closed.",
                            }
                        ),
                        400,
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
        context = _user_github_context(g.user) if item.github_issue_number else None
        issue_unlinked = False
        issue_reopened = False
        issue_closed = False
        if item.completed:
            if item.github_issue_number and context:
                try:
                    issue = update_issue(
                        context["token"],
                        context["owner"],
                        context["name"],
                        item.github_issue_number,
                        state="open",
                    )
                    item.github_issue_state = issue.state
                    _record_sync(item, "reopen_issue", "success", f"Issue #{issue.number} reopened")
                    issue_reopened = True
                except GitHubError as error:
                    if error.status_code == 404:
                        _clear_github_issue_link(item)
                        _record_sync(
                            item,
                            "reopen_issue",
                            "missing",
                            "Linked issue not found while reopening; link removed.",
                        )
                        issue_unlinked = True
                    else:
                        message, status = _github_error_response(error)
                        if error.status_code in (401, 403):
                            _invalidate_github(g.user)
                            try:
                                db.session.commit()
                            except SQLAlchemyError:
                                db.session.rollback()
                        if wants_json:
                            return (
                                jsonify(
                                    {
                                        "success": False,
                                        "message": message,
                                        "category": "danger",
                                    }
                                ),
                                status,
                            )
                        flash(message, "danger")
                        return redirect(request.referrer or url_for("task"))
            item.uncomplete_task()
        else:
            if item.github_issue_number and context:
                try:
                    issue = close_issue(
                        context["token"],
                        context["owner"],
                        context["name"],
                        item.github_issue_number,
                    )
                    comment_on_issue(
                        context["token"],
                        context["owner"],
                        context["name"],
                        item.github_issue_number,
                        "Closed from ProjectsManager.",
                    )
                    item.github_issue_state = issue.state
                    _record_sync(item, "close_issue", "success", f"Issue #{issue.number} closed")
                    issue_closed = True
                except GitHubError as error:
                    if error.status_code == 404:
                        _clear_github_issue_link(item)
                        _record_sync(
                            item,
                            "close_issue",
                            "missing",
                            "Linked issue not found while closing; link removed.",
                        )
                        issue_unlinked = True
                    else:
                        message, status = _github_error_response(error)
                        if error.status_code in (401, 403):
                            _invalidate_github(g.user)
                            try:
                                db.session.commit()
                            except SQLAlchemyError:
                                db.session.rollback()
                        if wants_json:
                            return (
                                jsonify(
                                    {
                                        "success": False,
                                        "message": message,
                                        "category": "danger",
                                    }
                                ),
                                status,
                            )
                        flash(message, "danger")
                        return redirect(request.referrer or url_for("task"))
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

        notes: list[str] = []
        if issue_reopened:
            notes.append("Linked GitHub issue reopened.")
        if issue_closed:
            notes.append("Linked GitHub issue closed.")
        if issue_unlinked:
            notes.append(GITHUB_ISSUE_MISSING_MESSAGE)
        if notes:
            message = f"{message} {' '.join(notes)}"

        if wants_json:
            payload = {
                "success": True,
                "completed": item.completed,
                "message": message,
                "category": category,
            }
            if issue_unlinked:
                payload["github_issue_unlinked"] = True
            if issue_reopened:
                payload["github_issue_reopened"] = True
            if issue_closed:
                payload["github_issue_closed"] = True
            return jsonify(payload)

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
