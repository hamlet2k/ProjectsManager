from markupsafe import Markup

from models.task import render_task_description_html


def test_nested_lists_use_expected_hierarchy():
    description = "- parent\n  - child\n  - child 2"

    html = render_task_description_html(description)
    html_str = str(html)

    assert isinstance(html, Markup)
    assert "<li>parent<ul>" in html_str
    assert "<li>child</li>" in html_str
    assert "<li>child 2</li>" in html_str


def test_empty_description_returns_empty_markup():
    html = render_task_description_html(None)

    assert isinstance(html, Markup)
    assert str(html) == ""


def test_disallowed_tags_are_sanitized():
    html = render_task_description_html("<script>alert('x')</script>")

    assert "<script" not in str(html).lower()
