from flask_wtf import FlaskForm
from wtforms import (
    DateTimeLocalField,
    HiddenField,
    SelectField,
    StringField,
    TextAreaField,
    SubmitField,
    PasswordField,
    BooleanField,
    RadioField,
)
from wtforms.validators import (
    DataRequired,
    Email,
    Optional,
    Length,
    Regexp,
    EqualTo,
    ValidationError,
)

THEME_CHOICES = [('light', 'Light'), ('dark', 'Dark')]

class SignupForm(FlaskForm):
    username = StringField("Username", [DataRequired()])
    name = StringField("Name", [DataRequired()])
    email = StringField("Email", [DataRequired(), Email()])
    password = PasswordField("Password", [DataRequired()])
    submit = SubmitField("Register")


class LoginForm(FlaskForm):
    username = StringField("Username", [DataRequired()])
    password = PasswordField("Password", [DataRequired()])
    submit = SubmitField("Login")

class UserSettingsForm(FlaskForm):
    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.current_user = user

    username = StringField(
        "Username",
        validators=[
            DataRequired(message="Username is required."),
            Length(max=80, message="Username must be 80 characters or fewer."),
            Regexp(
                r"^[A-Za-z0-9_.-]+$",
                message="Username may only include letters, numbers, dots, hyphens, and underscores.",
            ),
        ],
    )
    name = StringField("Name", [DataRequired()])
    email = StringField("Email", [DataRequired(), Email()])
    theme = RadioField(
        "Theme",
        choices=THEME_CHOICES,
        validators=[DataRequired(message="Selecting a theme is required.")],
        default="light",
    )
    submit = SubmitField("Save Changes")

    def validate_username(self, field):
        from models.user import User

        existing = User.query.filter_by(username=field.data).first()
        if existing and (not self.current_user or existing.id != self.current_user.id):
            raise ValidationError("This username is already in use.")

    def validate_email(self, field):
        from models.user import User

        existing = User.query.filter_by(email=field.data).first()
        if existing and (not self.current_user or existing.id != self.current_user.id):
            raise ValidationError("This email is already in use.")


class PasswordChangeForm(FlaskForm):
    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.current_user = user

    current_password = PasswordField(
        "Current Password",
        validators=[DataRequired(message="Current password is required.")],
    )
    new_password = PasswordField(
        "New Password",
        validators=[
            DataRequired(message="New password is required."),
            Length(min=8, message="Password must be at least 8 characters."),
            Regexp(
                r"^(?=.*[A-Za-z])(?=.*\d).+$",
                message="Password must include at least one letter and one number.",
            ),
        ],
    )
    confirm_password = PasswordField(
        "Confirm New Password",
        validators=[
            DataRequired(message="Please confirm the new password."),
            EqualTo("new_password", message="Passwords must match."),
        ],
    )
    submit = SubmitField("Update Password")

    def validate_current_password(self, field):
        if not self.current_user or not self.current_user.check_password(field.data):
            raise ValidationError("Current password is incorrect.")


class GitHubSettingsForm(FlaskForm):
    enabled = BooleanField("Enable GitHub Integration")
    token = PasswordField("GitHub Personal Access Token", [Optional()])
    submit = SubmitField("Save GitHub Settings")

class ScopeForm(FlaskForm):
    name = StringField("Name", [DataRequired()])
    description = TextAreaField("Description")
    github_enabled = BooleanField("Enable GitHub Integration")
    github_repository = SelectField(
        "Repository",
        choices=[],
        validators=[Optional()],
        validate_choice=False,
    )
    github_project = SelectField(
        "Project",
        choices=[],
        validators=[Optional()],
        validate_choice=False,
    )
    github_milestone = SelectField(
        "Milestone",
        choices=[],
        validators=[Optional()],
        validate_choice=False,
    )
    submit = SubmitField("Save Scope")


class TaskForm(FlaskForm):
    name = TextAreaField("Name", [DataRequired()])
    description = TextAreaField("Description")
    end_date = DateTimeLocalField("End Date", format="%Y-%m-%dT%H:%M", validators=[Optional()])
    tags = HiddenField("Tags")
    github_milestone = SelectField(
        "GitHub Milestone",
        choices=[],
        validators=[Optional()],
        validate_choice=False,
    )
    # completed = SelectField("Completed", choices=[(True, "Yes"), (False, "No")], coerce=bool)
    # rank = IntegerField("Rank")
    
    # Assuming 'parent_task_id' refers to another task
    # parent_task_id = SelectField(
    #     "Parent Task", coerce=int, choices=[]
    # )
    # Populate choices in the view
    # Add submit button if needed
    # submit = SubmitField("Save Task")


class SearchForm(FlaskForm):
    search = StringField("Search")
    submit = SubmitField("Go")
