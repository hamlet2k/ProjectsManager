# forms.py

from flask_wtf import FlaskForm
from wtforms import StringField, SubmitField
from wtforms.validators import DataRequired

class ScopeForm(FlaskForm):
    name = StringField('Name', validators=[DataRequired()])
    submit = SubmitField('Save')
    
class ResetDbForm(FlaskForm):
    submit = SubmitField('Reset Database')

class SearchForm(FlaskForm):
    search = StringField('Search')
    submit = SubmitField('Go')