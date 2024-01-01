# app.py

from flask import Flask

app = Flask(__name__)


@app.route("/")
def home():
    return "Welcome to ProjectsManager!"


if __name__ == "__main__":
    app.run(debug=True)


# app.py continued
@app.route("/projects")
def projects():
    return "List of projects will be displayed here."


@app.route("/tasks")
def tasks():
    return "List of tasks will be displayed here."
