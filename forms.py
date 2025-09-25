from flask_wtf import FlaskForm
from wtforms import (
    DateTimeLocalField,
    SelectField,
    StringField,
    TextAreaField,
    SubmitField,
    PasswordField,
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

class ScopeForm(FlaskForm):
    name = StringField("Name", [DataRequired()])
    description = TextAreaField("Description")
    submit = SubmitField("Save Scope")


class TaskForm(FlaskForm):
    name = StringField("Name", [DataRequired()])
    description = TextAreaField("Description")
    end_date = DateTimeLocalField("End Date", format="%Y-%m-%dT%H:%M", validators=[Optional()])
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
