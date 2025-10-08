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
)
from wtforms.validators import (
    DataRequired,
    Email,
    Optional
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
    from models.user import User
    username = StringField("Username", [DataRequired()])
    name = StringField("Name", [DataRequired()])
    email = StringField("Email", [DataRequired(), Email()])
    password = PasswordField("Password", [DataRequired()])
    role = SelectField("Role", choices=[(User.ADMIN, "Administrator"), (User.USER, "System User")])
    theme = SelectField("Theme", choices=THEME_CHOICES)  # Add valid choices here
    submit = SubmitField("Update")


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
    submit = SubmitField("Save Scope")


class TaskForm(FlaskForm):
    name = StringField("Name", [DataRequired()])
    description = TextAreaField("Description")
    end_date = DateTimeLocalField("End Date", format="%Y-%m-%dT%H:%M", validators=[Optional()])
    tags = HiddenField("Tags")
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
